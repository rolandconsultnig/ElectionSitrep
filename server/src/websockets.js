import { Server } from 'socket.io'
import jwt from 'jsonwebtoken'
import { joinCommandRooms } from './incidents.js'

export function initWebSockets(httpServer, pool, JWT_SECRET) {
  const io = new Server(httpServer, {
    cors: {
      origin: '*', // In production, refine this
      methods: ['GET', 'POST']
    }
  })

  const mgmtRoomSize = () => io.sockets.adapter.rooms.get('portal_management')?.size ?? 0

  /** Tell field officers how many HQ (management) users are currently online. */
  const broadcastHqPresence = () => {
    io.to('portal_field').emit('hq_presence', { count: mgmtRoomSize() })
  }

  // Middleware to authenticate socket connections
  io.use((socket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.query.token
    if (!token) return next(new Error('Authentication error'))

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
      if (err) return next(new Error('Authentication error'))
      socket.user = decoded // { sub: userId, username, portal }
      next()
    })
  })

  io.on('connection', (socket) => {
    const user = socket.user
    
    // Join a room based on their portal
    socket.join(`portal_${user.portal}`)
    // Also join a personal room for 1:1 signaling
    socket.join(`user_${user.sub}`)
    joinCommandRooms(pool, socket, user.sub, user.portal).catch((e) => console.error('[ws] command rooms', e))

    if (user.portal === 'field') {
      io.to('portal_management').emit('field_officer_online', {
        userId: user.sub,
        username: user.username,
        socketId: socket.id
      })
      // Immediate HQ presence snapshot for this officer
      socket.emit('hq_presence', { count: mgmtRoomSize() })
    } else {
      // For management/admin/command, send them the current list of online field officers
      const fieldRoom = io.sockets.adapter.rooms.get('portal_field')
      const activeOfficers = []
      if (fieldRoom) {
        for (const sId of fieldRoom) {
          const s = io.sockets.sockets.get(sId)
          if (s && s.user) {
            activeOfficers.push({
              userId: s.user.sub,
              username: s.user.username,
              socketId: s.id
            })
          }
        }
      }
      socket.emit('initial_active_officers', activeOfficers)
    }

    socket.on('disconnect', () => {
      if (user.portal === 'field') {
        io.to('portal_management').emit('field_officer_offline', {
          userId: user.sub
        })
      } else {
        broadcastHqPresence()
      }
    })

    // GPS location update
    socket.on('gps_update', (coords) => {
      // coords: { lat, lng, timestamp }
      io.to('portal_management').emit('field_officer_location', {
        userId: user.sub,
        username: user.username,
        coords
      })
    })

    // Chat messaging
    socket.on('send_chat_message', async (data) => {
      const { roomId: rawRoomId, content: rawContent } = data || {}
      if (!rawRoomId || typeof rawContent !== 'string' || !rawContent.trim()) return
      const content = rawContent.trim().slice(0, 4000)

      // Direct messages are persisted under a canonical pair room (dm_<lo>_<hi>)
      // so BOTH participants read the same history, while delivery still uses
      // the per-user rooms each socket has joined.
      let persistRoom = rawRoomId
      let dmTarget = null
      if (rawRoomId.startsWith('user_')) {
        dmTarget = rawRoomId.slice(5)
        const a = String(user.sub)
        const b = String(dmTarget)
        const [lo, hi] = a < b ? [a, b] : [b, a]
        persistRoom = `dm_${lo}_${hi}`
      }

      // Save to database
      try {
        const res = await pool.query(
          `INSERT INTO chat_messages (sender_id, room_id, content) VALUES ($1, $2, $3) RETURNING id, created_at`,
          [user.sub, persistRoom, content]
        )
        const msg = {
          id: res.rows[0].id,
          senderId: user.sub,
          senderUsername: user.username,
          roomId: persistRoom,
          content,
          createdAt: res.rows[0].created_at
        }
        if (dmTarget !== null) {
          io.to(`user_${dmTarget}`).emit('chat_message', msg)
          if (String(user.sub) !== String(dmTarget)) {
            socket.emit('chat_message', msg) // send back to sender
          }
        } else {
          io.to(persistRoom).emit('chat_message', msg)
        }
      } catch (err) {
        console.error('Error saving chat message:', err)
      }
    })

    // ---- Call signaling (ring / accept / decline / hang up) ----
    // Convention: the side that ACCEPTS the call creates the WebRTC offer
    // (simple-peer initiator), so the caller always knows the exact target.

    // Field officer places a call to HQ (any management user)
    socket.on('initiate_call', (data = {}) => {
      const callType = data.callType === 'audio' ? 'audio' : 'video'
      if (mgmtRoomSize() === 0) {
        socket.emit('call_unavailable')
        return
      }
      const callId = data.callId || `${user.sub}-${Date.now()}`
      io.to('portal_management').emit('incoming_call', {
        callId,
        callerId: user.sub,
        callerUsername: user.username,
        callType
      })
    })

    // Caller cancels while the HQ end is still ringing
    socket.on('cancel_call', (data = {}) => {
      if (!data.callId) return
      io.to('portal_management').emit('call_cancelled', { callId: data.callId })
    })

    // Management places a direct call to a specific field officer
    socket.on('call_user', (data = {}) => {
      const { targetUserId, callType, callId } = data || {}
      if (!targetUserId) return
      io.to(`user_${targetUserId}`).emit('incoming_call', {
        callId: callId || `${user.sub}-${Date.now()}`,
        callerId: user.sub,
        callerUsername: user.username,
        callType: callType === 'audio' ? 'audio' : 'video'
      })
    })

    // Callee -> caller: accepted or declined
    socket.on('call_response', (data = {}) => {
      const { callId, callerId, accepted } = data || {}
      if (!callerId) return
      io.to(`user_${callerId}`).emit('call_response', {
        callId,
        responderId: user.sub,
        responderUsername: user.username,
        accepted: !!accepted
      })
      if (accepted) {
        // Close the incoming-call modal on every other HQ screen
        io.to('portal_management').emit('call_taken', {
          callId,
          responderId: user.sub,
          responderUsername: user.username
        })
      }
    })

    // Hang up: notify the other side so it can tear down its peer
    socket.on('end_call', (data = {}) => {
      const { targetUserId } = data || {}
      if (targetUserId) {
        io.to(`user_${targetUserId}`).emit('call_ended', { byUsername: user.username })
      }
    })

    // WebRTC Signaling
    socket.on('webrtc_signal', (data) => {
      const { targetId, signal } = data
      // Forward the signal to the target user
      // targetId could be a socket.id OR a userId (room `user_ID`)
      io.to(`user_${targetId}`).emit('webrtc_signal', {
        senderId: user.sub,
        senderUsername: user.username,
        signal
      })
    })

    // ---- Phase 1-5 Operational Live Event Channels ----

    // Flash Command Directive broadcast
    socket.on('emit_flash_directive', (data) => {
      // Broadcast to all portals or specific target
      const payload = {
        ...data,
        issuedBy: user.username,
        issuedAt: new Date().toISOString()
      }
      io.emit('flash_directive_received', payload)
    })

    // Situation Room Video Wall synchronization broadcast
    socket.on('emit_wall_sync', (syncState) => {
      socket.broadcast.emit('wall_sync_updated', syncState)
    })

    // Panic / SOS Silent Distress Beacon
    socket.on('emit_panic_sos', (data) => {
      const sosAlert = {
        officerId: user.sub,
        officerUsername: user.username,
        timestamp: new Date().toISOString(),
        coords: data?.coords || null,
        notes: data?.notes || 'SILENT PANIC SOS TRIGGERED FROM FIELD'
      }
      io.to('portal_management').to('portal_igp').to('portal_admin').emit('panic_sos_alert', sosAlert)
    })

    // Officer Safety Dead-Man's Switch Check-in
    socket.on('emit_officer_checkin', (data) => {
      io.to('portal_management').to('portal_igp').emit('officer_checkin_recorded', {
        officerId: user.sub,
        officerUsername: user.username,
        status: data?.status || 'OK',
        timestamp: new Date().toISOString()
      })
    })

    // Cryptographic Block Mined & Broadcast
    socket.on('emit_ledger_block', (block) => {
      io.emit('crypto_block_appended', block)
    })
  })

  return io
}

