import { Server } from 'socket.io'
import jwt from 'jsonwebtoken'
import { joinCommandRooms } from './incidents.js'
import { ChatError, persistAndDeliverChatMessage, sendAuthorizedDm } from './chat.js'

export function initWebSockets(httpServer, pool, JWT_SECRET) {
  const io = new Server(httpServer, {
    cors: {
      origin: '*', // In production, refine this
      methods: ['GET', 'POST']
    }
  })

  const hqRoomSize = () => ['portal_management', 'portal_igp', 'portal_admin']
    .reduce((count, room) => count + (io.sockets.adapter.rooms.get(room)?.size ?? 0), 0)

  /** Tell field officers how many command portal users are currently online. */
  const broadcastHqPresence = () => {
    io.to('portal_field').emit('hq_presence', { count: hqRoomSize() })
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
    const personalRoom = `user_${user.sub}`
    const wasOnline = Boolean(io.sockets.adapter.rooms.get(personalRoom)?.size)
    
    // Join a room based on their portal
    socket.join(`portal_${user.portal}`)
    // Also join a personal room for 1:1 signaling
    socket.join(personalRoom)
    joinCommandRooms(pool, socket, user.sub, user.portal).catch((e) => console.error('[ws] command rooms', e))

    if (user.portal === 'field') {
      if (!wasOnline) io.to('portal_management').to('portal_igp').to('portal_admin').emit('field_officer_online', {
        userId: user.sub,
        username: user.username,
        socketId: socket.id
      })
      // Immediate HQ presence snapshot for this officer
      socket.emit('hq_presence', { count: hqRoomSize() })
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
      if (['management', 'igp', 'admin'].includes(user.portal)) broadcastHqPresence()
    }

    socket.on('disconnect', () => {
      if (user.portal === 'field') {
        if (!io.sockets.adapter.rooms.get(personalRoom)?.size) {
          io.to('portal_management').to('portal_igp').to('portal_admin').emit('field_officer_offline', { userId: user.sub })
        }
      } else {
        broadcastHqPresence()
      }
    })

    // --- Polling-unit geofence -------------------------------------------
    // Authoritative server-side check: distance from the officer's assigned
    // PU. Two consecutive fixes outside 100 m = breach; one inside = return.
    // Client-reported breach/return events are also relayed so alerts raised
    // while offline still reach the command centre on reconnect.
    const GEOFENCE_RADIUS_M = 100
    const GEOFENCE_STRIKES = 2
    const GEOFENCE_MAX_ACCURACY_M = 60
    const haversineM = (lat1, lng1, lat2, lng2) => {
      const R = 6371000
      const toRad = (d) => (d * Math.PI) / 180
      const dLat = toRad(lat2 - lat1)
      const dLng = toRad(lng2 - lng1)
      const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
      return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)))
    }
    const commandRooms = () => io.to('portal_management').to('portal_igp').to('portal_admin')

    const emitGeofenceBreach = (state, lat, lng, distanceM, reportedBy) => {
      state.breached = true
      commandRooms().emit('field_officer_geofence_breach', {
        userId: user.sub,
        username: user.username,
        pollingUnit: state.target,
        coords: { lat, lng },
        distanceM: Math.round(distanceM),
        radiusM: GEOFENCE_RADIUS_M,
        timestamp: new Date().toISOString(),
        reportedBy,
      })
    }
    const emitGeofenceReturn = (state, lat, lng, distanceM, reportedBy) => {
      state.breached = false
      commandRooms().emit('field_officer_geofence_return', {
        userId: user.sub,
        username: user.username,
        pollingUnit: state.target,
        coords: { lat, lng },
        distanceM: Math.round(distanceM),
        timestamp: new Date().toISOString(),
        reportedBy,
      })
    }

    socket.on('geofence_breach', (data = {}) => {
      if (user.portal !== 'field') return
      const state = socket.data.geofence ??= { outStrikes: 0, breached: false, target: null }
      const t = data?.pollingUnitCoords
      if (!state.target && t && Number.isFinite(t.lat) && Number.isFinite(t.lng)) {
        state.target = {
          id: String(data.pollingUnitId ?? ''),
          name: typeof data.pollingUnitName === 'string' ? data.pollingUnitName : 'Assigned post',
          code: typeof data.pollingUnitCode === 'string' ? data.pollingUnitCode : null,
          lat: t.lat, lng: t.lng,
        }
      }
      if (state.breached) return
      const lat = state.target?.lat, lng = state.target?.lng
      emitGeofenceBreach(state, lat ?? null, lng ?? null, Number(data.distanceM) || 0, 'client')
    })
    socket.on('geofence_return', (data = {}) => {
      if (user.portal !== 'field') return
      const state = socket.data.geofence ??= { outStrikes: 0, breached: false, target: null }
      if (!state.breached) return
      const t = state.target
      emitGeofenceReturn(state, t?.lat ?? null, t?.lng ?? null, Number(data.distanceM) || 0, 'client')
    })

    // GPS location update
    socket.on('gps_update', async (coords = {}) => {
      if (user.portal !== 'field' || !coords || typeof coords !== 'object') return
      const { lat, lng } = coords
      if (typeof lat !== 'number' || !Number.isFinite(lat) || lat < -90 || lat > 90 ||
          typeof lng !== 'number' || !Number.isFinite(lng) || lng < -180 || lng > 180) return

      // Server-side geofence evaluation (authoritative for command alerts)
      try {
        const state = socket.data.geofence ??= { outStrikes: 0, breached: false, target: null, loaded: false }
        if (!state.loaded) {
          state.loaded = true
          const { rows } = await pool.query(
            `SELECT gpu.id, gpu.name, gpu.code, gpu.lat, gpu.lng
             FROM officer_profiles op
             JOIN geo_polling_units gpu ON gpu.id = op.assigned_polling_unit_id
             WHERE op.user_id = $1`,
            [user.sub],
          )
          const pu = rows[0]
          if (pu && Number.isFinite(Number(pu.lat)) && Number.isFinite(Number(pu.lng))) {
            state.target = { id: String(pu.id), name: pu.name, code: pu.code ?? null, lat: Number(pu.lat), lng: Number(pu.lng) }
          }
        }
        if (state.target) {
          const accuracy = Number(coords.accuracy)
          const trusted = !Number.isFinite(accuracy) || accuracy <= GEOFENCE_MAX_ACCURACY_M
          if (trusted) {
            const distanceM = haversineM(lat, lng, state.target.lat, state.target.lng)
            if (distanceM > GEOFENCE_RADIUS_M) {
              state.outStrikes += 1
              if (!state.breached && state.outStrikes >= GEOFENCE_STRIKES) {
                emitGeofenceBreach(state, lat, lng, distanceM, 'server')
              }
            } else {
              state.outStrikes = 0
              if (state.breached) emitGeofenceReturn(state, lat, lng, distanceM, 'server')
            }
          }
        }
      } catch (error) {
        console.error('[ws] geofence check failed', error)
      }

      const now = Date.now()
      if (now - (socket.data.lastGpsPersistAttempt ?? 0) >= 20_000) {
        socket.data.lastGpsPersistAttempt = now
        try {
          await pool.query(
            `INSERT INTO officer_safety (user_id, last_lat, last_lng, telemetry_at, position_source)
             VALUES ($1, $2, $3, now(), 'gps')
             ON CONFLICT (user_id) DO UPDATE SET last_lat = EXCLUDED.last_lat, last_lng = EXCLUDED.last_lng,
               telemetry_at = now(), position_source = 'gps'`,
            [user.sub, lat, lng],
          )
        } catch (error) {
          console.error('[ws] gps persistence failed', error)
        }
      }

      io.to('portal_management').to('portal_igp').to('portal_admin').emit('field_officer_location', {
        userId: user.sub,
        username: user.username,
        coords: { lat, lng },
        timestamp: new Date().toISOString(),
        source: 'gps',
      })
    })

    // Chat messaging
    socket.on('send_chat_message', async (data, acknowledge) => {
      const { roomId: rawRoomId, content: rawContent } = data || {}
      try {
        if (typeof rawContent !== 'string' || !rawContent.trim() || rawContent.trim().length > 4000) {
          throw new ChatError('Message must be 1–4000 characters', 400)
        }
        const content = rawContent.trim()
        let message
        if (typeof rawRoomId === 'string' && rawRoomId.startsWith('user_')) {
          message = await sendAuthorizedDm(pool, io, user.sub, rawRoomId.slice(5), content)
        } else if (rawRoomId === 'portal_management') {
          message = await persistAndDeliverChatMessage(pool, io, {
            sender: { id: user.sub, username: user.username, portal: user.portal },
            roomId: rawRoomId,
            content,
          })
        } else {
          throw new ChatError('Unsupported chat room', 403)
        }
        if (typeof acknowledge === 'function') acknowledge({ ok: true, message })
      } catch (err) {
        const response = { ok: false, error: err.message ?? 'Could not send message' }
        if (typeof acknowledge === 'function') acknowledge(response)
        socket.emit('chat_send_error', response)
        if (!(err instanceof ChatError)) console.error('Error saving chat message:', err)
      }
    })

    // ---- Call signaling (ring / accept / decline / hang up) ----
    // Convention: the side that ACCEPTS the call creates the WebRTC offer
    // (simple-peer initiator), so the caller always knows the exact target.

    // Field officer places a call to HQ (any management user)
    socket.on('initiate_call', (data = {}) => {
      const callType = data.callType === 'audio' ? 'audio' : 'video'
      if ((io.sockets.adapter.rooms.get('portal_management')?.size ?? 0) === 0) {
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
