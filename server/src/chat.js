import { Router } from 'express'
import { authorizeDm, canonicalDmRoom, isDmParticipant } from './chatAuthorization.js'
import { commandScope } from './incidents.js'

const COMMAND_PORTALS = new Set(['management', 'igp', 'admin'])

export class ChatError extends Error {
  constructor(message, status = 400) {
    super(message)
    this.status = status
  }
}

function limitFrom(value) {
  const n = Number(value)
  return Number.isFinite(n) ? Math.min(1000, Math.max(1, Math.floor(n))) : 100
}

async function loadDmUsers(pool, senderId, targetId) {
  const q = await pool.query(
    `SELECT u.id::text AS id, u.username, u.portal, u.jurisdiction_level, u.jurisdiction_state_id,
            u.jurisdiction_lga_id, gl.id AS assigned_lga_id, gl.state_id AS assigned_state_id
     FROM app_users u
     LEFT JOIN officer_profiles op ON op.user_id = u.id
     LEFT JOIN geo_polling_units gp ON gp.id = op.assigned_polling_unit_id
     LEFT JOIN geo_wards gw ON gw.id = gp.ward_id
     LEFT JOIN geo_lgas gl ON gl.id = gw.lga_id
     WHERE u.id::text = ANY($1::text[])`,
    [[String(senderId), String(targetId)]],
  )
  const sender = q.rows.find((row) => row.id === String(senderId))
  const target = q.rows.find((row) => row.id === String(targetId))
  if (!sender) throw new ChatError('Sender not found', 401)
  if (!target) throw new ChatError('Recipient not found', 404)

  const scope = COMMAND_PORTALS.has(sender.portal) ? await commandScope(pool, sender.id) : null
  const decision = authorizeDm({
    senderId: sender.id,
    senderPortal: sender.portal,
    targetId: target.id,
    targetPortal: target.portal,
    scope,
    targetStateId: target.assigned_state_id,
    targetLgaId: target.assigned_lga_id,
  })
  if (!decision.allowed) throw new ChatError(decision.reason, 403)
  return { sender, target }
}

export async function persistAndDeliverChatMessage(pool, io, { sender, roomId, targetId = null, content }) {
  const persistRoom = targetId === null ? roomId : canonicalDmRoom(sender.id, targetId)
  const client = await pool.connect()
  let row
  try {
    await client.query('BEGIN')
    const inserted = await client.query(
      `INSERT INTO chat_messages (sender_id, room_id, content) VALUES ($1, $2, $3) RETURNING id, created_at`,
      [sender.id, persistRoom, content],
    )
    row = inserted.rows[0]
    if (targetId !== null && COMMAND_PORTALS.has(sender.portal)) {
      await client.query(
        `INSERT INTO audit_log (entity_type, entity_id, action, actor_user_id, payload)
         VALUES ('chat_dm', $1, 'send', $2, $3::jsonb)`,
        [String(targetId), sender.id, JSON.stringify({ roomId: persistRoom })],
      )
    }
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }

  const message = {
    id: row.id,
    senderId: String(sender.id),
    senderUsername: sender.username,
    roomId: persistRoom,
    content,
    createdAt: row.created_at,
  }
  if (targetId !== null) {
    io?.to(`user_${sender.id}`).to(`user_${targetId}`).emit('chat_message', message)
  } else {
    io?.to(persistRoom).emit('chat_message', message)
  }
  return message
}

export async function sendAuthorizedDm(pool, io, senderId, targetId, rawContent) {
  const content = typeof rawContent === 'string' ? rawContent.trim() : ''
  if (content.length < 1 || content.length > 4000) throw new ChatError('Message must be 1–4000 characters', 400)
  if (!targetId || String(senderId) === String(targetId)) throw new ChatError('Self-DM is not allowed', 400)

  const { sender, target } = await loadDmUsers(pool, senderId, targetId)
  return persistAndDeliverChatMessage(pool, io, { sender, targetId: target.id, content })
}

async function rowsForRoom(pool, roomId, limit) {
  const q = await pool.query(
    `SELECT m.id, m.sender_id, u.username AS sender_username, m.room_id, m.content, m.created_at
     FROM chat_messages m JOIN app_users u ON u.id = m.sender_id
     WHERE m.room_id = $1
     ORDER BY m.created_at DESC LIMIT $2`,
    [roomId, limit],
  )
  return q.rows.reverse()
}

export function createChatRouter({ pool, authMiddleware, getIo }) {
  const router = Router()

  router.get('/dm/history', authMiddleware, async (req, res) => {
    try {
      const limit = limitFrom(req.query.limit)
      const q = await pool.query(
        `SELECT m.id, m.sender_id, u.username AS sender_username, m.room_id, m.content, m.created_at
         FROM chat_messages m JOIN app_users u ON u.id = m.sender_id
         WHERE left(m.room_id, 3) = 'dm_'
           AND (split_part(m.room_id, '_', 2) = $1 OR split_part(m.room_id, '_', 3) = $1)
         ORDER BY m.created_at DESC LIMIT $2`,
        [String(req.auth.sub), limit],
      )
      res.json({ messages: q.rows.reverse() })
    } catch (error) {
      console.error('[chat/dm/history]', error)
      res.status(500).json({ error: 'Could not load direct messages' })
    }
  })

  router.get('/dm/:otherUserId', authMiddleware, async (req, res) => {
    try {
      const { target } = await loadDmUsers(pool, req.auth.sub, req.params.otherUserId)
      const roomId = canonicalDmRoom(req.auth.sub, target.id)
      res.json({ messages: await rowsForRoom(pool, roomId, limitFrom(req.query.limit)) })
    } catch (error) {
      res.status(error.status ?? 500).json({ error: error.message ?? 'Could not load direct messages' })
    }
  })

  router.post('/dm/:otherUserId', authMiddleware, async (req, res) => {
    try {
      const message = await sendAuthorizedDm(pool, getIo(), req.auth.sub, req.params.otherUserId, req.body?.content)
      res.status(201).json({ message })
    } catch (error) {
      res.status(error.status ?? 500).json({ error: error.message ?? 'Could not send direct message' })
    }
  })

  router.get('/:roomId', authMiddleware, async (req, res) => {
    const { roomId } = req.params
    if (roomId !== 'portal_management' && !isDmParticipant(roomId, req.auth.sub)) {
      return res.status(403).json({ error: 'You are not a participant in this room' })
    }
    try {
      res.json({ messages: await rowsForRoom(pool, roomId, limitFrom(req.query.limit)) })
    } catch (error) {
      console.error('[chat/history]', error)
      res.status(500).json({ error: 'Could not load chat history' })
    }
  })

  return router
}
