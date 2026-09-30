import { Router } from 'express'
import bcrypt from 'bcrypt'
import { createHash } from 'node:crypto'

export const SEVERITIES = ['low', 'medium', 'high', 'critical']
export const LEVELS = ['dpo', 'area', 'state', 'fhq']
const LEVEL_LABEL = { dpo: 'DPO', area: 'Area Command', state: 'State Command', fhq: 'Force HQ' }
const INITIAL_LEVEL = { low: 'dpo', medium: 'area', high: 'state', critical: 'fhq' }
const SLA_MINUTES = { low: 60, medium: 30, high: 15, critical: 5 }
const COMMAND_PORTALS = ['management', 'igp', 'admin']
const CHECKIN_GRACE_MIN = 10
const DEFAULT_CHECKIN_INTERVAL_MIN = 60

function num(v) {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function parseDataUrl(dataUrl) {
  const m = /^data:([^;,]+);base64,(.+)$/s.exec(String(dataUrl || ''))
  if (!m) return null
  return { mime: m[1].slice(0, 64), buffer: Buffer.from(m[2], 'base64') }
}

function nextLevel(level) {
  const i = LEVELS.indexOf(level)
  return i >= 0 && i < LEVELS.length - 1 ? LEVELS[i + 1] : null
}

function slaDue(severity, from = new Date()) {
  return new Date(from.getTime() + (SLA_MINUTES[severity] ?? 30) * 60_000)
}

/** Socket rooms that should be alerted for an event located in (stateId, lgaId) at a given escalation level. */
export function alertRooms({ stateId, lgaId, level, everyone = false }) {
  const rooms = new Set()
  if (lgaId) rooms.add(`cmd_lga_${lgaId}`)
  if (stateId && (everyone || level === 'state' || level === 'fhq')) rooms.add(`cmd_state_${stateId}`)
  if (everyone || level === 'fhq' || !stateId) rooms.add('cmd_national')
  return [...rooms]
}

function visibilityRooms({ stateId, lgaId }) {
  const rooms = ['cmd_national']
  if (stateId) rooms.push(`cmd_state_${stateId}`)
  if (lgaId) rooms.push(`cmd_lga_${lgaId}`)
  return rooms
}

function emitTo(io, rooms, event, payload) {
  if (!io || !rooms.length) return
  let target = io
  for (const r of rooms) target = target.to(r)
  target.emit(event, payload)
}

async function officerGeo(db, userId) {
  const r = await db.query(
    `SELECT gp.id AS pu_id, gw.id AS ward_id, gl.id AS lga_id, gl.state_id AS state_id, gp.lat, gp.lng
     FROM officer_profiles op
     JOIN geo_polling_units gp ON gp.id = op.assigned_polling_unit_id
     JOIN geo_wards gw ON gw.id = gp.ward_id
     JOIN geo_lgas gl ON gl.id = gw.lga_id
     WHERE op.user_id = $1`,
    [userId],
  )
  return r.rows[0] ?? null
}

export async function commandScope(db, userId) {
  const r = await db.query(
    `SELECT jurisdiction_level, jurisdiction_state_id, jurisdiction_lga_id FROM app_users WHERE id = $1`,
    [userId],
  )
  const row = r.rows[0]
  if (!row) return { level: 'none' }
  if (row.jurisdiction_level === 'area' && row.jurisdiction_lga_id) return { level: 'area', lgaId: row.jurisdiction_lga_id }
  if (row.jurisdiction_level === 'state' && row.jurisdiction_state_id)
    return { level: 'state', stateId: row.jurisdiction_state_id }
  return { level: 'national' }
}

/** Appends `AND …` scoping clause on alias `a` (must have state_id / lga_id). */
export function scopeSql(scope, alias, params) {
  if (scope.level === 'area') {
    params.push(scope.lgaId)
    return ` AND ${alias}.lga_id = $${params.length}`
  }
  if (scope.level === 'state') {
    params.push(scope.stateId)
    return ` AND ${alias}.state_id = $${params.length}`
  }
  if (scope.level === 'national') return ''
  return ' AND false'
}

const INCIDENT_SELECT = `
  SELECT i.id, i.type_code, t.label AS type_label, t.category AS type_category, i.severity, i.is_flash,
         i.title, i.description, i.details, i.state_id, gs.name AS state_name, i.lga_id, gl.name AS lga_name,
         i.ward_id, gw.name AS ward_name, i.pu_id, gp.code AS pu_code, gp.name AS pu_name,
         i.lat, i.lng, i.status, i.escalation_level, i.sla_due_at, i.acknowledged_at, i.resolved_at,
         i.created_at, i.device_created_at, (i.photo_data IS NOT NULL) AS has_photo, i.photo_sha256,
         u.username AS reporter_username, op.full_name AS reporter_name, op.service_number AS reporter_service_number,
         au.username AS acknowledged_by_username
  FROM incidents i
  JOIN incident_types t ON t.code = i.type_code
  JOIN app_users u ON u.id = i.reporter_user_id
  LEFT JOIN officer_profiles op ON op.user_id = i.reporter_user_id
  LEFT JOIN app_users au ON au.id = i.acknowledged_by
  LEFT JOIN geo_states gs ON gs.id = i.state_id
  LEFT JOIN geo_lgas gl ON gl.id = i.lga_id
  LEFT JOIN geo_wards gw ON gw.id = i.ward_id
  LEFT JOIN geo_polling_units gp ON gp.id = i.pu_id`

function incidentDto(r) {
  return {
    id: Number(r.id),
    typeCode: r.type_code,
    typeLabel: r.type_label,
    typeCategory: r.type_category,
    severity: r.severity,
    isFlash: r.is_flash,
    title: r.title,
    description: r.description,
    details: r.details ?? {},
    location: {
      stateId: r.state_id,
      stateName: r.state_name,
      lgaId: r.lga_id,
      lgaName: r.lga_name,
      wardId: r.ward_id,
      wardName: r.ward_name,
      puId: r.pu_id,
      puCode: r.pu_code,
      puName: r.pu_name,
      lat: r.lat,
      lng: r.lng,
    },
    status: r.status,
    escalationLevel: r.escalation_level,
    escalationLabel: LEVEL_LABEL[r.escalation_level],
    slaDueAt: r.sla_due_at,
    acknowledgedAt: r.acknowledged_at,
    acknowledgedBy: r.acknowledged_by_username ?? null,
    resolvedAt: r.resolved_at,
    createdAt: r.created_at,
    deviceCreatedAt: r.device_created_at,
    hasPhoto: r.has_photo,
    photoSha256: r.photo_sha256,
    reporter: {
      username: r.reporter_username,
      name: r.reporter_name,
      serviceNumber: r.reporter_service_number,
    },
  }
}

async function loadIncident(db, id) {
  const r = await db.query(`${INCIDENT_SELECT} WHERE i.id = $1`, [id])
  return r.rows[0] ? incidentDto(r.rows[0]) : null
}

async function addEvent(db, incidentId, actorId, action, note = null) {
  await db.query(`INSERT INTO incident_events (incident_id, actor_user_id, action, note) VALUES ($1, $2, $3, $4)`, [
    incidentId,
    actorId,
    action,
    note,
  ])
}

function broadcastIncident(io, inc, { alert }) {
  const loc = { stateId: inc.location.stateId, lgaId: inc.location.lgaId }
  emitTo(io, visibilityRooms(loc), 'incident_updated', inc)
  if (alert) {
    const rooms = alertRooms({ ...loc, level: inc.escalationLevel, everyone: inc.isFlash })
    emitTo(io, rooms, 'incident_alert', inc)
  }
}

/**
 * Creates a structured incident. Shared by POST /api/incidents and offline /api/field/sync.
 * @returns {{ ok: true, incident, duplicate?: boolean } | { ok: false, error: string, status?: number }}
 */
export async function createIncident(db, io, userId, body, { clientId = null, deviceCreatedAt = null } = {}) {
  const typeCode = String(body?.typeCode ?? '').trim()
  const t = await db.query(`SELECT code, label, default_severity FROM incident_types WHERE code = $1 AND active`, [typeCode])
  if (!t.rows.length) return { ok: false, status: 400, error: 'Unknown incident type' }
  const type = t.rows[0]
  const isFlash = body?.isFlash === true || body?.isFlash === 'true'
  let severity = String(body?.severity ?? '').trim().toLowerCase()
  if (!SEVERITIES.includes(severity)) severity = type.default_severity
  if (isFlash) severity = 'critical'
  const description = String(body?.description ?? '').trim().slice(0, 8000)
  const title = String(body?.title ?? '').trim().slice(0, 191) || type.label
  if (!isFlash && severity !== 'low' && description.length < 5) {
    return { ok: false, status: 400, error: 'Description required for medium/high/critical incidents' }
  }
  const details = body?.details && typeof body.details === 'object' && !Array.isArray(body.details) ? body.details : {}

  const geo = await officerGeo(db, userId)
  const lat = num(body?.lat) ?? geo?.lat ?? null
  const lng = num(body?.lng) ?? geo?.lng ?? null
  const level = isFlash ? 'fhq' : INITIAL_LEVEL[severity]

  let photo = null
  if (body?.photoDataUrl) photo = parseDataUrl(body.photoDataUrl)
  const photoSha = photo ? createHash('sha256').update(photo.buffer).digest('hex') : null

  const now = new Date()
  const ins = await db.query(
    `INSERT INTO incidents (reporter_user_id, client_id, type_code, severity, is_flash, title, description, details,
       state_id, lga_id, ward_id, pu_id, lat, lng, escalation_level, sla_due_at, photo_data, photo_mime, photo_sha256,
       device_created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
     ON CONFLICT (reporter_user_id, client_id) DO NOTHING
     RETURNING id`,
    [
      userId,
      clientId,
      type.code,
      severity,
      isFlash,
      title,
      description,
      JSON.stringify(details),
      geo?.state_id ?? null,
      geo?.lga_id ?? null,
      geo?.ward_id ?? null,
      geo?.pu_id ?? null,
      lat,
      lng,
      level,
      slaDue(severity, now),
      photo?.buffer ?? null,
      photo?.mime ?? null,
      photoSha,
      deviceCreatedAt,
    ],
  )
  if (!ins.rows.length) return { ok: true, duplicate: true, incident: null }
  const id = ins.rows[0].id
  await addEvent(db, id, userId, isFlash ? 'flash' : 'reported', `Routed to ${LEVEL_LABEL[level]}`)
  const incident = await loadIncident(db, id)
  broadcastIncident(io, incident, { alert: isFlash || severity !== 'low' })
  return { ok: true, incident }
}

async function locationForUser(db, userId) {
  const geo = await officerGeo(db, userId)
  return { stateId: geo?.state_id ?? null, lgaId: geo?.lga_id ?? null }
}

async function sosDto(db, id) {
  const r = await db.query(
    `SELECT s.id, s.user_id, s.kind, s.status, s.note, s.started_at, s.resolved_at,
            u.username, op.full_name, op.service_number, op.phone,
            gp.code AS pu_code, gp.name AS pu_name, gl.id AS lga_id, gl.name AS lga_name,
            gl.state_id, gs.name AS state_name
     FROM sos_alerts s
     JOIN app_users u ON u.id = s.user_id
     LEFT JOIN officer_profiles op ON op.user_id = s.user_id
     LEFT JOIN geo_polling_units gp ON gp.id = op.assigned_polling_unit_id
     LEFT JOIN geo_wards gw ON gw.id = gp.ward_id
     LEFT JOIN geo_lgas gl ON gl.id = gw.lga_id
     LEFT JOIN geo_states gs ON gs.id = gl.state_id
     WHERE s.id = $1`,
    [id],
  )
  const s = r.rows[0]
  if (!s) return null
  const trail = await db.query(
    `SELECT lat, lng, accuracy_m, recorded_at FROM sos_locations WHERE sos_id = $1 ORDER BY recorded_at ASC LIMIT 500`,
    [id],
  )
  return {
    id: Number(s.id),
    userId: s.user_id,
    kind: s.kind,
    status: s.status,
    note: s.note,
    startedAt: s.started_at,
    resolvedAt: s.resolved_at,
    officer: { username: s.username, name: s.full_name, serviceNumber: s.service_number, phone: s.phone },
    location: { stateId: s.state_id, stateName: s.state_name, lgaId: s.lga_id, lgaName: s.lga_name, puCode: s.pu_code, puName: s.pu_name },
    trail: trail.rows.map((p) => ({ lat: p.lat, lng: p.lng, accuracyM: p.accuracy_m, at: p.recorded_at })),
  }
}

async function broadcastSos(db, io, sosId, event) {
  const dto = await sosDto(db, sosId)
  if (!dto) return null
  emitTo(io, alertRooms({ stateId: dto.location.stateId, lgaId: dto.location.lgaId, everyone: true }), event, dto)
  return dto
}

/** Opens (or reuses) an active SOS for a user. Used by the panic button and duress-PIN login. */
export async function raiseSos(db, io, userId, kind, { lat = null, lng = null, accuracy = null, note = null } = {}) {
  const existing = await db.query(`SELECT id FROM sos_alerts WHERE user_id = $1 AND status = 'active' AND kind = $2 LIMIT 1`, [
    userId,
    kind,
  ])
  let id = existing.rows[0]?.id
  if (!id) {
    const r = await db.query(`INSERT INTO sos_alerts (user_id, kind, note) VALUES ($1, $2, $3) RETURNING id`, [userId, kind, note])
    id = r.rows[0].id
  }
  if (lat !== null && lng !== null) {
    await db.query(`INSERT INTO sos_locations (sos_id, lat, lng, accuracy_m) VALUES ($1, $2, $3, $4)`, [id, lat, lng, accuracy])
  }
  await broadcastSos(db, io, id, 'sos_alert')
  return Number(id)
}

/**
 * Duress-PIN check for login: returns true when the supplied secret matches the user's duress PIN.
 * Flags the account as compromised and raises a silent duress SOS.
 */
export async function checkDuressLogin(db, io, userId, secret) {
  const r = await db.query(`SELECT duress_pin_hash FROM app_users WHERE id = $1`, [userId])
  const hash = r.rows[0]?.duress_pin_hash
  if (!hash || !(await bcrypt.compare(secret, hash))) return false
  await db.query(`UPDATE app_users SET compromised_at = COALESCE(compromised_at, now()) WHERE id = $1`, [userId])
  await raiseSos(db, io, userId, 'duress', { note: 'Signed in with duress PIN' })
  return true
}

async function safetyInterval(db) {
  const r = await db.query(`SELECT value FROM system_settings WHERE key = 'safety'`)
  const v = r.rows[0]?.value
  const n = Number(v?.checkinIntervalMinutes)
  return Number.isFinite(n) && n >= 5 && n <= 1440 ? Math.round(n) : DEFAULT_CHECKIN_INTERVAL_MIN
}

async function safetyStatus(db, userId) {
  const r = await db.query(`SELECT * FROM officer_safety WHERE user_id = $1`, [userId])
  const s = r.rows[0]
  return s
    ? {
        intervalMinutes: s.interval_minutes,
        lastOkAt: s.last_ok_at,
        nextDueAt: s.next_due_at,
        missed: Boolean(s.missed_flagged_at),
      }
    : { intervalMinutes: await safetyInterval(db), lastOkAt: null, nextDueAt: null, missed: false }
}

/** Escalates overdue incidents and flags missed check-ins. Runs on an interval. */
export async function runSafetyTick(db, io) {
  const overdue = await db.query(
    `SELECT id, severity, escalation_level FROM incidents
     WHERE status = 'open' AND sla_due_at IS NOT NULL AND sla_due_at < now()
     ORDER BY sla_due_at ASC LIMIT 200`,
  )
  for (const row of overdue.rows) {
    const up = nextLevel(row.escalation_level)
    if (up) {
      await db.query(`UPDATE incidents SET escalation_level = $2, sla_due_at = $3 WHERE id = $1`, [
        row.id,
        up,
        slaDue(row.severity),
      ])
      await addEvent(db, row.id, null, 'auto_escalated', `No response within SLA → ${LEVEL_LABEL[up]}`)
    } else {
      await db.query(`UPDATE incidents SET sla_due_at = NULL WHERE id = $1`, [row.id])
      await addEvent(db, row.id, null, 'sla_breached', 'Unacknowledged at Force HQ level')
    }
    const inc = await loadIncident(db, row.id)
    broadcastIncident(io, inc, { alert: true })
  }

  const missed = await db.query(
    `UPDATE officer_safety SET missed_flagged_at = now()
     WHERE missed_flagged_at IS NULL AND next_due_at IS NOT NULL
       AND next_due_at < now() - make_interval(mins => $1)
     RETURNING user_id, next_due_at, last_lat, last_lng`,
    [CHECKIN_GRACE_MIN],
  )
  for (const m of missed.rows) {
    const loc = await locationForUser(db, m.user_id)
    const u = await db.query(
      `SELECT u.username, op.full_name, op.service_number FROM app_users u LEFT JOIN officer_profiles op ON op.user_id = u.id WHERE u.id = $1`,
      [m.user_id],
    )
    emitTo(io, alertRooms({ ...loc, everyone: true }), 'checkin_missed', {
      userId: m.user_id,
      username: u.rows[0]?.username,
      name: u.rows[0]?.full_name,
      serviceNumber: u.rows[0]?.service_number,
      dueAt: m.next_due_at,
      lastLat: m.last_lat,
      lastLng: m.last_lng,
    })
  }
}

export function createIncidentRouter({ pool, authMiddleware, requireAnyPortal, getIo }) {
  const r = Router()
  const command = requireAnyPortal(...COMMAND_PORTALS)
  const commandWrite = requireAnyPortal('management', 'admin')

  r.get('/incident-types', authMiddleware, async (_req, res) => {
    const q = await pool.query(
      `SELECT code, label, category, default_severity FROM incident_types WHERE active ORDER BY sort_order, label`,
    )
    res.json({
      types: q.rows.map((t) => ({ code: t.code, label: t.label, category: t.category, defaultSeverity: t.default_severity })),
      severities: SEVERITIES,
      slaMinutes: SLA_MINUTES,
    })
  })

  r.post('/incidents', authMiddleware, requireAnyPortal('field', 'management', 'admin'), async (req, res) => {
    try {
      const out = await createIncident(pool, getIo(), req.auth.sub, req.body ?? {}, {
        clientId: req.body?.clientId ? String(req.body.clientId).slice(0, 64) : null,
        deviceCreatedAt: req.body?.createdAt ? new Date(req.body.createdAt) : null,
      })
      if (!out.ok) return res.status(out.status ?? 400).json({ error: out.error })
      return res.status(201).json(out)
    } catch (e) {
      console.error(e)
      return res.status(500).json({ error: 'Failed to record incident' })
    }
  })

  r.get('/incidents/mine', authMiddleware, requireAnyPortal('field'), async (req, res) => {
    const q = await pool.query(`${INCIDENT_SELECT} WHERE i.reporter_user_id = $1 ORDER BY i.created_at DESC LIMIT 50`, [
      req.auth.sub,
    ])
    res.json({ incidents: q.rows.map(incidentDto) })
  })

  r.get('/incidents', authMiddleware, command, async (req, res) => {
    try {
      const scope = await commandScope(pool, req.auth.sub)
      const params = []
      let where = ' WHERE true'
      where += scopeSql(scope, 'i', params)
      const status = String(req.query.status ?? '').trim()
      if (status === 'active') where += ` AND i.status <> 'resolved'`
      else if (['open', 'acknowledged', 'resolved'].includes(status)) {
        params.push(status)
        where += ` AND i.status = $${params.length}`
      }
      const severity = String(req.query.severity ?? '').trim()
      if (SEVERITIES.includes(severity)) {
        params.push(severity)
        where += ` AND i.severity = $${params.length}`
      }
      if (req.query.flash === 'true') where += ' AND i.is_flash'
      const hours = num(req.query.sinceHours)
      if (hours && hours > 0) {
        params.push(hours)
        where += ` AND i.created_at > now() - make_interval(hours => $${params.length}::int)`
      }
      const limit = Math.min(500, Math.max(1, num(req.query.limit) ?? 200))
      params.push(limit)
      const q = await pool.query(
        `${INCIDENT_SELECT}${where}
         ORDER BY (i.status = 'resolved'), i.is_flash DESC,
                  array_position(ARRAY['critical','high','medium','low']::text[], i.severity::text), i.created_at DESC
         LIMIT $${params.length}`,
        params,
      )
      res.json({ scope, incidents: q.rows.map(incidentDto) })
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: 'Failed to load incidents' })
    }
  })

  r.get('/incidents/summary', authMiddleware, command, async (req, res) => {
    try {
      const scope = await commandScope(pool, req.auth.sub)
      const params = []
      const sc = scopeSql(scope, 'i', params)
      const [bySev, byType, counts] = await Promise.all([
        pool.query(`SELECT severity, count(*)::int AS n FROM incidents i WHERE i.status <> 'resolved'${sc} GROUP BY severity`, params),
        pool.query(
          `SELECT t.label, count(*)::int AS n FROM incidents i JOIN incident_types t ON t.code = i.type_code
           WHERE i.created_at > now() - interval '24 hours'${sc} GROUP BY t.label ORDER BY n DESC`,
          params,
        ),
        pool.query(
          `SELECT count(*) FILTER (WHERE i.status = 'open')::int AS open,
                  count(*) FILTER (WHERE i.status = 'open' AND i.sla_due_at IS NULL)::int AS breached,
                  count(*) FILTER (WHERE i.is_flash AND i.status <> 'resolved')::int AS flash,
                  percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM i.acknowledged_at - i.created_at))
                    FILTER (WHERE i.acknowledged_at IS NOT NULL AND i.created_at > now() - interval '24 hours') AS median_ack_s
           FROM incidents i WHERE true${sc}`,
          params,
        ),
      ])
      res.json({
        activeBySeverity: Object.fromEntries(bySev.rows.map((x) => [x.severity, x.n])),
        last24hByType: byType.rows,
        open: counts.rows[0].open,
        slaBreached: counts.rows[0].breached,
        activeFlash: counts.rows[0].flash,
        medianAckSeconds: counts.rows[0].median_ack_s === null ? null : Math.round(Number(counts.rows[0].median_ack_s)),
      })
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: 'Failed to load summary' })
    }
  })

  async function scopedIncident(req, res) {
    const scope = await commandScope(pool, req.auth.sub)
    const params = [req.params.id]
    const q = await pool.query(`SELECT id FROM incidents i WHERE i.id = $1${scopeSql(scope, 'i', params)}`, params)
    if (!q.rows.length) {
      res.status(404).json({ error: 'Incident not found' })
      return null
    }
    return q.rows[0].id
  }

  r.get('/incidents/:id', authMiddleware, command, async (req, res) => {
    const id = await scopedIncident(req, res)
    if (!id) return
    const inc = await loadIncident(pool, id)
    const ev = await pool.query(
      `SELECT e.action, e.note, e.created_at, u.username FROM incident_events e
       LEFT JOIN app_users u ON u.id = e.actor_user_id WHERE e.incident_id = $1 ORDER BY e.created_at`,
      [id],
    )
    res.json({ incident: inc, events: ev.rows.map((e) => ({ action: e.action, note: e.note, at: e.created_at, by: e.username })) })
  })

  r.get('/incidents/:id/photo', authMiddleware, command, async (req, res) => {
    const id = await scopedIncident(req, res)
    if (!id) return
    const q = await pool.query(`SELECT photo_data, photo_mime, photo_sha256 FROM incidents WHERE id = $1`, [id])
    const p = q.rows[0]
    if (!p?.photo_data) return res.status(404).json({ error: 'No photo' })
    res.setHeader('Content-Type', p.photo_mime || 'image/jpeg')
    res.setHeader('X-Content-SHA256', p.photo_sha256 || '')
    res.setHeader('Cache-Control', 'private, max-age=300')
    res.send(p.photo_data)
  })

  r.post('/incidents/:id/:action', authMiddleware, commandWrite, async (req, res) => {
    try {
      if (!['acknowledge', 'escalate', 'resolve', 'note'].includes(req.params.action)) {
        return res.status(404).json({ error: 'Unknown action' })
      }
      const id = await scopedIncident(req, res)
      if (!id) return
      const note = req.body?.note ? String(req.body.note).slice(0, 2000) : null
      const cur = (await pool.query(`SELECT status, severity, escalation_level FROM incidents WHERE id = $1`, [id])).rows[0]
      const action = req.params.action
      let alert = false
      if (action === 'acknowledge') {
        if (cur.status !== 'open') return res.status(409).json({ error: `Incident already ${cur.status}` })
        await pool.query(
          `UPDATE incidents SET status = 'acknowledged', acknowledged_by = $2, acknowledged_at = now(), sla_due_at = NULL WHERE id = $1`,
          [id, req.auth.sub],
        )
      } else if (action === 'escalate') {
        const up = nextLevel(cur.escalation_level)
        if (!up) return res.status(409).json({ error: 'Already at Force HQ' })
        await pool.query(`UPDATE incidents SET escalation_level = $2, status = 'open', sla_due_at = $3 WHERE id = $1`, [
          id,
          up,
          slaDue(cur.severity),
        ])
        alert = true
      } else if (action === 'resolve') {
        if (cur.status === 'resolved') return res.status(409).json({ error: 'Incident already resolved' })
        if (!note) return res.status(400).json({ error: 'Resolution note required' })
        await pool.query(
          `UPDATE incidents SET status = 'resolved', resolved_by = $2, resolved_at = now(), sla_due_at = NULL WHERE id = $1`,
          [id, req.auth.sub],
        )
      } else if (!note) {
        return res.status(400).json({ error: 'Note required' })
      }
      await addEvent(pool, id, req.auth.sub, action === 'note' ? 'note' : `${action}d`, note)
      const inc = await loadIncident(pool, id)
      broadcastIncident(getIo(), inc, { alert })
      res.json({ incident: inc })
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: 'Update failed' })
    }
  })

  // --- SOS / panic ---
  r.post('/sos', authMiddleware, requireAnyPortal('field'), async (req, res) => {
    try {
      const id = await raiseSos(pool, getIo(), req.auth.sub, 'panic', {
        lat: num(req.body?.lat),
        lng: num(req.body?.lng),
        accuracy: num(req.body?.accuracy),
        note: req.body?.note ? String(req.body.note).slice(0, 500) : null,
      })
      res.status(201).json({ id })
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: 'SOS failed' })
    }
  })

  r.post('/sos/:id/location', authMiddleware, requireAnyPortal('field'), async (req, res) => {
    const lat = num(req.body?.lat)
    const lng = num(req.body?.lng)
    if (lat === null || lng === null) return res.status(400).json({ error: 'lat/lng required' })
    const own = await pool.query(`SELECT id FROM sos_alerts WHERE id = $1 AND user_id = $2 AND status = 'active'`, [
      req.params.id,
      req.auth.sub,
    ])
    if (!own.rows.length) return res.status(404).json({ error: 'No active SOS', active: false })
    await pool.query(`INSERT INTO sos_locations (sos_id, lat, lng, accuracy_m) VALUES ($1, $2, $3, $4)`, [
      req.params.id,
      lat,
      lng,
      num(req.body?.accuracy),
    ])
    await broadcastSos(pool, getIo(), req.params.id, 'sos_location')
    res.json({ ok: true, active: true })
  })

  r.get('/sos/mine', authMiddleware, requireAnyPortal('field'), async (req, res) => {
    const q = await pool.query(
      `SELECT id FROM sos_alerts WHERE user_id = $1 AND status = 'active' AND kind = 'panic' ORDER BY started_at DESC LIMIT 1`,
      [req.auth.sub],
    )
    res.json({ activeId: q.rows[0] ? Number(q.rows[0].id) : null })
  })

  r.get('/sos', authMiddleware, command, async (req, res) => {
    const scope = await commandScope(pool, req.auth.sub)
    const params = []
    const sc = scopeSql(scope, 'g', params)
    const q = await pool.query(
      `SELECT s.id FROM sos_alerts s
       LEFT JOIN officer_profiles op ON op.user_id = s.user_id
       LEFT JOIN geo_polling_units gp ON gp.id = op.assigned_polling_unit_id
       LEFT JOIN geo_wards gw ON gw.id = gp.ward_id
       LEFT JOIN (SELECT id AS lga_id, state_id FROM geo_lgas) g ON g.lga_id = gw.lga_id
       WHERE (s.status = 'active' OR s.started_at > now() - interval '24 hours')${sc}
       ORDER BY (s.status = 'active') DESC, s.started_at DESC LIMIT 100`,
      params,
    )
    const alerts = []
    for (const row of q.rows) alerts.push(await sosDto(pool, row.id))
    res.json({ alerts })
  })

  r.post('/sos/:id/resolve', authMiddleware, commandWrite, async (req, res) => {
    const up = await pool.query(
      `UPDATE sos_alerts SET status = 'resolved', resolved_at = now(), resolved_by = $2,
         note = COALESCE(note || E'\n', '') || $3
       WHERE id = $1 AND status = 'active' RETURNING id`,
      [req.params.id, req.auth.sub, String(req.body?.note ?? 'Resolved by command').slice(0, 1000)],
    )
    if (!up.rows.length) return res.status(404).json({ error: 'No active SOS' })
    const dto = await broadcastSos(pool, getIo(), req.params.id, 'sos_resolved')
    res.json({ alert: dto })
  })

  // --- Duress PIN ---
  r.put('/me/duress-pin', authMiddleware, async (req, res) => {
    const pin = String(req.body?.pin ?? '')
    if (pin === '') {
      await pool.query(`UPDATE app_users SET duress_pin_hash = NULL WHERE id = $1`, [req.auth.sub])
      return res.json({ ok: true, enabled: false })
    }
    if (pin.length < 6) return res.status(400).json({ error: 'Duress PIN must be at least 6 characters' })
    const u = await pool.query(`SELECT password_hash FROM app_users WHERE id = $1`, [req.auth.sub])
    if (await bcrypt.compare(pin, u.rows[0].password_hash)) {
      return res.status(400).json({ error: 'Duress PIN must differ from your password' })
    }
    const hash = await bcrypt.hash(pin, 12)
    await pool.query(`UPDATE app_users SET duress_pin_hash = $2 WHERE id = $1`, [req.auth.sub, hash])
    res.json({ ok: true, enabled: true })
  })

  r.get('/me/duress-pin', authMiddleware, async (req, res) => {
    const u = await pool.query(`SELECT duress_pin_hash IS NOT NULL AS enabled FROM app_users WHERE id = $1`, [req.auth.sub])
    res.json({ enabled: Boolean(u.rows[0]?.enabled) })
  })

  // --- Safety check-ins ---
  r.get('/safety/checkin', authMiddleware, requireAnyPortal('field'), async (req, res) => {
    res.json(await safetyStatus(pool, req.auth.sub))
  })

  r.post('/safety/checkin', authMiddleware, requireAnyPortal('field'), async (req, res) => {
    const interval = await safetyInterval(pool)
    const battery = num(req.body?.batteryPct)
    await pool.query(
      `INSERT INTO officer_safety (user_id, interval_minutes, last_ok_at, next_due_at, missed_flagged_at, last_lat, last_lng,
         battery_pct, network, telemetry_at)
       VALUES ($1, $2, now(), now() + make_interval(mins => $2), NULL, $3, $4, $5, $6, now())
       ON CONFLICT (user_id) DO UPDATE SET interval_minutes = $2, last_ok_at = now(),
         next_due_at = now() + make_interval(mins => $2), missed_flagged_at = NULL,
         last_lat = COALESCE($3, officer_safety.last_lat), last_lng = COALESCE($4, officer_safety.last_lng),
         battery_pct = COALESCE($5, officer_safety.battery_pct), network = COALESCE($6, officer_safety.network),
         telemetry_at = now()`,
      [
        req.auth.sub,
        interval,
        num(req.body?.lat),
        num(req.body?.lng),
        battery === null ? null : Math.max(0, Math.min(100, Math.round(battery))),
        req.body?.network ? String(req.body.network).slice(0, 32) : null,
      ],
    )
    res.json(await safetyStatus(pool, req.auth.sub))
  })

  r.get('/safety/overview', authMiddleware, command, async (req, res) => {
    const scope = await commandScope(pool, req.auth.sub)
    const params = []
    const sc = scopeSql(scope, 'gl', params)
    const q = await pool.query(
      `SELECT u.id, u.username, op.full_name, op.service_number, op.phone, gp.code AS pu_code, gp.name AS pu_name,
              gl.name AS lga_name, gs.name AS state_name, s.last_ok_at, s.next_due_at, s.missed_flagged_at,
              s.last_lat, s.last_lng, s.battery_pct, s.network, s.telemetry_at,
              EXISTS (SELECT 1 FROM sos_alerts a WHERE a.user_id = u.id AND a.status = 'active') AS sos_active
       FROM app_users u
       LEFT JOIN officer_profiles op ON op.user_id = u.id
       LEFT JOIN officer_safety s ON s.user_id = u.id
       LEFT JOIN geo_polling_units gp ON gp.id = op.assigned_polling_unit_id
       LEFT JOIN geo_wards gw ON gw.id = gp.ward_id
       LEFT JOIN (SELECT id, name, state_id, id AS lga_id FROM geo_lgas) gl ON gl.id = gw.lga_id
       LEFT JOIN geo_states gs ON gs.id = gl.state_id
       WHERE u.portal = 'field'${sc}
       ORDER BY sos_active DESC, (s.missed_flagged_at IS NOT NULL) DESC, s.next_due_at NULLS LAST
       LIMIT 1000`,
      params,
    )
    res.json({
      intervalMinutes: await safetyInterval(pool),
      officers: q.rows.map((o) => ({
        userId: o.id,
        username: o.username,
        name: o.full_name,
        serviceNumber: o.service_number,
        phone: o.phone,
        post: o.pu_code ? `${o.pu_code} · ${o.pu_name}` : null,
        lgaName: o.lga_name,
        stateName: o.state_name,
        status: o.sos_active
          ? 'sos'
          : o.missed_flagged_at
            ? 'missed'
            : !o.next_due_at
              ? 'not_started'
              : new Date(o.next_due_at) < new Date()
                ? 'due'
                : 'ok',
        lastOkAt: o.last_ok_at,
        nextDueAt: o.next_due_at,
        lastLat: o.last_lat,
        lastLng: o.last_lng,
        batteryPct: o.battery_pct,
        network: o.network,
        telemetryAt: o.telemetry_at,
      })),
    })
  })

  r.put('/safety/settings', authMiddleware, requireAnyPortal('admin', 'management'), async (req, res) => {
    const n = Number(req.body?.checkinIntervalMinutes)
    if (!Number.isFinite(n) || n < 5 || n > 1440) return res.status(400).json({ error: 'Interval must be 5–1440 minutes' })
    await pool.query(
      `INSERT INTO system_settings (key, value) VALUES ('safety', $1::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [JSON.stringify({ checkinIntervalMinutes: Math.round(n) })],
    )
    res.json({ intervalMinutes: Math.round(n) })
  })

  return r
}

/** Joins command users to jurisdiction rooms used by alertRooms(). */
export async function joinCommandRooms(db, socket, userId, portal) {
  if (!COMMAND_PORTALS.includes(portal)) return
  const scope = await commandScope(db, userId)
  if (scope.level === 'area') socket.join(`cmd_lga_${scope.lgaId}`)
  else if (scope.level === 'state') socket.join(`cmd_state_${scope.stateId}`)
  else if (scope.level === 'national') socket.join('cmd_national')
}
