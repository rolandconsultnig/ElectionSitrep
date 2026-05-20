import { Server } from 'socket.io'
import jwt from 'jsonwebtoken'

export function initWebSockets(httpServer, pool, JWT_SECRET) {
  const io = new Server(httpServer, {
    cors: {
      origin: '*', // In production, refine this
      methods: ['GET', 'POST']
    }
  })

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

    // Broadcast presence to management
    if (user.portal === 'field') {
      io.to('portal_management').emit('field_officer_online', {
        userId: user.sub,
        username: user.username,
        socketId: socket.id
      })
    }

    socket.on('disconnect', () => {
      if (user.portal === 'field') {
        io.to('portal_management').emit('field_officer_offline', {
          userId: user.sub
        })
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
      const { roomId, content } = data
      // Save to database
      try {
        const res = await pool.query(
          `INSERT INTO chat_messages (sender_id, room_id, content) VALUES ($1, $2, $3) RETURNING id, created_at`,
          [user.sub, roomId, content]
        )
        const msg = {
          id: res.rows[0].id,
          senderId: user.sub,
          senderUsername: user.username,
          roomId,
          content,
          createdAt: res.rows[0].created_at
        }
        // Broadcast to the room
        // If roomId is a portal (e.g. 'portal_field'), it goes to everyone in field
        // If roomId is a user's ID, we emit to user_USERID and the sender
        if (roomId.startsWith('user_')) {
          io.to(roomId).emit('chat_message', msg)
          if (`user_${user.sub}` !== roomId) {
            socket.emit('chat_message', msg) // send back to sender
          }
        } else {
          io.to(roomId).emit('chat_message', msg)
        }
      } catch (err) {
        console.error('Error saving chat message:', err)
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

  })

  return io
}
