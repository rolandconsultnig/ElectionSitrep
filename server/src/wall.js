import express from 'express'
import { commandScope, scopeSql } from './incidents.js'

const COMMAND_PORTALS = ['management', 'igp', 'admin']
const SEVERITY_WEIGHT = `CASE i.severity WHEN 'critical' THEN 8 WHEN 'high' THEN 4 WHEN 'medium' THEN 2 ELSE 1 END`
const LEVEL_LABEL = { dpo: 'DPO', area: 'Area Command', state: 'State Command', fhq: 'Force HQ' }

/** National wall focus (single state), shared by every wall display. */
let wallFocus = { stateId: null, stateName: null, setBy: null, setAt: null }

function num(v) {
  return v === null || v === undefined ? null : Math.round(Number(v))
}

async function wallScope(pool, userId) {
  const scope = await commandScope(pool, userId)
  if (scope.level === 'national' && wallFocus.stateId) return { level: 'state', stateId: wallFocus.stateId }
  return scope
}

async function buildWall(pool, userId) {
  const scope = await wallScope(pool, userId)
  const run = (sql, alias) => {
    const params = []
    return pool.query(sql.replace('/*SCOPE*/', scopeSql(scope, alias, params)), params)
  }

  const [counters, takeover, ticker, escalations, escCounts, mapInc, officers, heat, hotspots, mix, sos, devices, response, states] =
    await Promise.all([
      run(
        `SELECT count(*) FILTER (WHERE i.status = 'open')::int AS open,
                count(*) FILTER (WHERE i.status = 'acknowledged')::int AS acknowledged,
                count(*) FILTER (WHERE i.is_flash AND i.status <> 'resolved')::int AS flash,
                count(*) FILTER (WHERE i.status = 'open' AND (i.sla_due_at IS NULL OR i.sla_due_at < now()))::int AS overdue,
                count(*) FILTER (WHERE i.status <> 'resolved' AND i.severity = 'critical')::int AS critical,
                count(*) FILTER (WHERE i.status <> 'resolved' AND i.severity = 'high')::int AS high,
                count(*) FILTER (WHERE i.created_at > now() - interval '24 hours')::int AS last24h,
                count(*) FILTER (WHERE i.created_at <= now() - interval '24 hours' AND i.created_at > now() - interval '48 hours')::int AS prev24h,
                count(*) FILTER (WHERE i.resolved_at > now() - interval '24 hours')::int AS resolved24h
         FROM incidents i WHERE true/*SCOPE*/`,
        'i',
      ),
      run(
        `SELECT i.id, t.label AS type_label, i.severity, i.is_flash, i.escalation_level, i.created_at, i.sla_due_at,
                gs.name AS state_name, gl.name AS lga_name, gp.code AS pu_code
         FROM incidents i JOIN incident_types t ON t.code = i.type_code
         LEFT JOIN geo_states gs ON gs.id = i.state_id LEFT JOIN geo_lgas gl ON gl.id = i.lga_id
         LEFT JOIN geo_polling_units gp ON gp.id = i.pu_id
         WHERE i.is_flash AND i.status = 'open'/*SCOPE*/ ORDER BY i.created_at DESC LIMIT 5`,
        'i',
      ),
      run(
        `SELECT i.id, t.label AS type_label, i.severity, i.is_flash, i.status, i.escalation_level, i.created_at, i.sla_due_at,
                gs.name AS state_name, gl.name AS lga_name
         FROM incidents i JOIN incident_types t ON t.code = i.type_code
         LEFT JOIN geo_states gs ON gs.id = i.state_id LEFT JOIN geo_lgas gl ON gl.id = i.lga_id
         WHERE i.status <> 'resolved' AND i.severity IN ('critical', 'high')/*SCOPE*/
         ORDER BY i.created_at DESC LIMIT 20`,
        'i',
      ),
      run(
        `SELECT i.id, t.label AS type_label, i.severity, i.is_flash, i.escalation_level, i.created_at, i.sla_due_at,
                gs.name AS state_name, gl.name AS lga_name
         FROM incidents i JOIN incident_types t ON t.code = i.type_code
         LEFT JOIN geo_states gs ON gs.id = i.state_id LEFT JOIN geo_lgas gl ON gl.id = i.lga_id
         WHERE i.status = 'open'/*SCOPE*/
         ORDER BY i.sla_due_at ASC NULLS FIRST, i.created_at ASC LIMIT 16`,
        'i',
      ),
      run(
        `SELECT i.escalation_level AS level, count(*)::int AS n,
                count(*) FILTER (WHERE i.sla_due_at IS NULL OR i.sla_due_at < now())::int AS overdue
         FROM incidents i WHERE i.status = 'open'/*SCOPE*/ GROUP BY i.escalation_level`,
        'i',
      ),
      run(
        `SELECT i.id, i.severity, i.is_flash, t.label AS type_label, gl.name AS lga_name,
                COALESCE(i.lat, gl.center_lat, gs.center_lat) AS lat, COALESCE(i.lng, gl.center_lng, gs.center_lng) AS lng
         FROM incidents i JOIN incident_types t ON t.code = i.type_code
         LEFT JOIN geo_lgas gl ON gl.id = i.lga_id LEFT JOIN geo_states gs ON gs.id = i.state_id
         WHERE i.status <> 'resolved' AND i.created_at > now() - interval '24 hours'/*SCOPE*/
         ORDER BY i.created_at DESC LIMIT 800`,
        'i',
      ),
      run(
        `SELECT s.last_lat AS lat, s.last_lng AS lng,
                CASE WHEN EXISTS (SELECT 1 FROM sos_alerts a WHERE a.user_id = u.id AND a.status = 'active') THEN 'sos'
                     WHEN s.missed_flagged_at IS NOT NULL THEN 'missed'
                     WHEN s.telemetry_at IS NULL OR s.telemetry_at < now() - interval '30 minutes' THEN 'stale'
                     ELSE 'ok' END AS status
         FROM app_users u JOIN officer_safety s ON s.user_id = u.id
         LEFT JOIN officer_profiles op ON op.user_id = u.id
         LEFT JOIN geo_polling_units gp ON gp.id = op.assigned_polling_unit_id
         LEFT JOIN geo_wards gw ON gw.id = gp.ward_id
         LEFT JOIN (SELECT id, state_id, id AS lga_id FROM geo_lgas) g ON g.id = gw.lga_id
         WHERE u.portal = 'field' AND s.last_lat IS NOT NULL/*SCOPE*/ LIMIT 3000`,
        'g',
      ),
      run(
        `SELECT gs.id AS state_id, gs.name AS state_name, gs.center_lat AS lat, gs.center_lng AS lng,
                count(*) FILTER (WHERE i.created_at > now() - interval '6 hours')::int AS h6,
                count(*) FILTER (WHERE i.created_at > now() - interval '12 hours')::int AS h12,
                count(*)::int AS h24,
                count(*) FILTER (WHERE i.created_at > now() - interval '12 hours' AND i.created_at <= now() - interval '6 hours')::int AS prev6,
                coalesce(sum(${SEVERITY_WEIGHT}) FILTER (WHERE i.status <> 'resolved'), 0)::int AS open_weight
         FROM incidents i JOIN geo_states gs ON gs.id = i.state_id
         WHERE i.created_at > now() - interval '24 hours'/*SCOPE*/
         GROUP BY gs.id ORDER BY h24 DESC`,
        'i',
      ),
      run(
        `SELECT gl.id AS lga_id, gl.name AS lga_name, gs.name AS state_name,
                sum(${SEVERITY_WEIGHT})::int AS weight, count(*)::int AS n,
                count(*) FILTER (WHERE i.severity = 'critical')::int AS critical
         FROM incidents i JOIN geo_lgas gl ON gl.id = i.lga_id JOIN geo_states gs ON gs.id = gl.state_id
         WHERE i.created_at > now() - interval '2 hours'/*SCOPE*/
         GROUP BY gl.id, gs.name ORDER BY weight DESC, n DESC LIMIT 10`,
        'i',
      ),
      run(
        `SELECT t.label, count(*)::int AS n
         FROM incidents i JOIN incident_types t ON t.code = i.type_code
         WHERE i.created_at >= date_trunc('day', now() AT TIME ZONE 'Africa/Lagos') AT TIME ZONE 'Africa/Lagos'/*SCOPE*/
         GROUP BY t.label ORDER BY n DESC LIMIT 12`,
        'i',
      ),
      run(
        `SELECT s.id, s.kind, s.started_at, op.full_name, op.service_number, u.username, gl.name AS lga_name, gs.name AS state_name,
                loc.lat, loc.lng, loc.recorded_at
         FROM sos_alerts s JOIN app_users u ON u.id = s.user_id
         LEFT JOIN officer_profiles op ON op.user_id = s.user_id
         LEFT JOIN geo_polling_units gp ON gp.id = op.assigned_polling_unit_id
         LEFT JOIN geo_wards gw ON gw.id = gp.ward_id
         LEFT JOIN (SELECT id, name, state_id, id AS lga_id FROM geo_lgas) gl ON gl.id = gw.lga_id
         LEFT JOIN geo_states gs ON gs.id = gl.state_id
         LEFT JOIN LATERAL (SELECT lat, lng, recorded_at FROM sos_locations l WHERE l.sos_id = s.id ORDER BY recorded_at DESC LIMIT 1) loc ON true
         WHERE s.status = 'active'/*SCOPE*/ ORDER BY s.started_at DESC LIMIT 20`,
        'gl',
      ),
      run(
        `SELECT op.full_name, u.username, gl.name AS lga_name, gs.name AS state_name, s.battery_pct, s.network, s.telemetry_at
         FROM app_users u JOIN officer_safety s ON s.user_id = u.id
         LEFT JOIN officer_profiles op ON op.user_id = u.id
         LEFT JOIN geo_polling_units gp ON gp.id = op.assigned_polling_unit_id
         LEFT JOIN geo_wards gw ON gw.id = gp.ward_id
         LEFT JOIN (SELECT id, name, state_id, id AS lga_id FROM geo_lgas) gl ON gl.id = gw.lga_id
         LEFT JOIN geo_states gs ON gs.id = gl.state_id
         WHERE u.portal = 'field' AND s.telemetry_at > now() - interval '12 hours'
           AND (s.battery_pct < 20 OR s.network IN ('none', 'offline') OR s.telemetry_at < now() - interval '30 minutes')/*SCOPE*/
         ORDER BY s.battery_pct ASC NULLS LAST LIMIT 20`,
        'gl',
      ),
      run(
        `SELECT gs.name AS state_name, count(*)::int AS n,
                percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM i.acknowledged_at - i.created_at))
                  FILTER (WHERE i.acknowledged_at IS NOT NULL) AS ack_s,
                percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM i.resolved_at - i.created_at))
                  FILTER (WHERE i.resolved_at IS NOT NULL) AS resolve_s
         FROM incidents i JOIN geo_states gs ON gs.id = i.state_id
         WHERE i.created_at > now() - interval '24 hours'/*SCOPE*/
         GROUP BY gs.name ORDER BY n DESC LIMIT 15`,
        'i',
      ),
      pool.query(`SELECT id, name, center_lat AS lat, center_lng AS lng FROM geo_states ORDER BY name`),
    ])

  const national = await run(
    `SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM acknowledged_at - created_at))
              FILTER (WHERE acknowledged_at IS NOT NULL) AS ack_s,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM resolved_at - created_at))
              FILTER (WHERE resolved_at IS NOT NULL) AS resolve_s
     FROM incidents i WHERE i.created_at > now() - interval '24 hours'/*SCOPE*/`,
    'i',
  )
  const safety = await run(
    `SELECT count(*)::int AS tracked,
            count(*) FILTER (WHERE s.missed_flagged_at IS NOT NULL)::int AS missed,
            count(*) FILTER (WHERE s.telemetry_at > now() - interval '30 minutes')::int AS live
     FROM app_users u JOIN officer_safety s ON s.user_id = u.id
     LEFT JOIN officer_profiles op ON op.user_id = u.id
     LEFT JOIN geo_polling_units gp ON gp.id = op.assigned_polling_unit_id
     LEFT JOIN geo_wards gw ON gw.id = gp.ward_id
     LEFT JOIN (SELECT id, state_id, id AS lga_id FROM geo_lgas) g ON g.id = gw.lga_id
     WHERE u.portal = 'field'/*SCOPE*/`,
    'g',
  )

  const c = counters.rows[0]
  const loc = (x) => [x.lga_name, x.state_name].filter(Boolean).join(', ') || 'Location pending'
  const brief = (x) => ({
    id: x.id,
    type: x.type_label,
    severity: x.severity,
    isFlash: x.is_flash,
    status: x.status,
    level: x.escalation_level,
    levelLabel: LEVEL_LABEL[x.escalation_level] ?? x.escalation_level,
    location: loc(x),
    createdAt: x.created_at,
    slaDueAt: x.sla_due_at,
  })

  return {
    serverTime: new Date().toISOString(),
    scope: scope.level,
    focus: wallFocus,
    states: states.rows,
    counters: {
      open: c.open,
      acknowledged: c.acknowledged,
      activeFlash: c.flash,
      overdue: c.overdue,
      critical: c.critical,
      high: c.high,
      last24h: c.last24h,
      prev24h: c.prev24h,
      resolved24h: c.resolved24h,
      activeSos: sos.rows.length,
      missedCheckins: safety.rows[0].missed,
      officersTracked: safety.rows[0].tracked,
      officersLive: safety.rows[0].live,
    },
    takeover: {
      flash: takeover.rows.map((x) => ({ ...brief(x), location: [x.pu_code, loc(x)].filter(Boolean).join(' · ') })),
      sos: sos.rows.map((s) => ({
        id: s.id,
        kind: s.kind,
        officer: s.full_name || s.username,
        serviceNumber: s.service_number,
        location: loc(s),
        lat: s.lat,
        lng: s.lng,
        lastFixAt: s.recorded_at,
        startedAt: s.started_at,
      })),
    },
    ticker: ticker.rows.map(brief),
    escalations: {
      byLevel: Object.fromEntries(escCounts.rows.map((x) => [x.level, { open: x.n, overdue: x.overdue }])),
      items: escalations.rows.map(brief),
    },
    map: {
      incidents: mapInc.rows
        .filter((x) => x.lat !== null && x.lng !== null)
        .map((x) => ({ id: x.id, severity: x.severity, isFlash: x.is_flash, type: x.type_label, lga: x.lga_name, lat: x.lat, lng: x.lng })),
      officers: officers.rows,
      states: heat.rows.map((x) => ({ stateId: x.state_id, name: x.state_name, lat: x.lat, lng: x.lng, openWeight: x.open_weight })),
    },
    heat: heat.rows.map((x) => ({
      stateId: x.state_id,
      state: x.state_name,
      h6: x.h6,
      h12: x.h12,
      h24: x.h24,
      trend: x.h6 > x.prev6 ? 'up' : x.h6 < x.prev6 ? 'down' : 'flat',
    })),
    hotspots: hotspots.rows.map((x) => ({ lga: x.lga_name, state: x.state_name, weight: x.weight, count: x.n, critical: x.critical })),
    mix: mix.rows,
    safety: {
      devicesAtRisk: devices.rows.map((d) => ({
        officer: d.full_name || d.username,
        location: loc(d),
        batteryPct: d.battery_pct,
        network: d.network,
        telemetryAt: d.telemetry_at,
      })),
    },
    response: {
      medianAckSeconds: num(national.rows[0]?.ack_s),
      medianResolveSeconds: num(national.rows[0]?.resolve_s),
      byState: response.rows.map((x) => ({ state: x.state_name, count: x.n, ackSeconds: num(x.ack_s), resolveSeconds: num(x.resolve_s) })),
    },
  }
}

export function createWallRouter({ pool, authMiddleware, requireAnyPortal, getIo }) {
  const r = express.Router()
  const command = requireAnyPortal(...COMMAND_PORTALS)
  const focusWriters = requireAnyPortal('igp', 'management', 'admin')

  r.get('/wall', authMiddleware, command, async (req, res) => {
    try {
      res.json(await buildWall(pool, req.auth.sub))
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: 'Failed to load wall data' })
    }
  })

  r.put('/wall/focus', authMiddleware, focusWriters, async (req, res) => {
    const scope = await commandScope(pool, req.auth.sub)
    if (scope.level !== 'national') return res.status(403).json({ error: 'Only national command can set the wall focus' })
    const raw = req.body?.stateId
    if (raw === null || raw === undefined || raw === '') {
      wallFocus = { stateId: null, stateName: null, setBy: req.auth.username ?? null, setAt: new Date().toISOString() }
    } else {
      const st = await pool.query(`SELECT id, name FROM geo_states WHERE id = $1`, [Number(raw)])
      if (!st.rows.length) return res.status(400).json({ error: 'Unknown state' })
      wallFocus = { stateId: st.rows[0].id, stateName: st.rows[0].name, setBy: req.auth.username ?? null, setAt: new Date().toISOString() }
    }
    getIo()?.to('cmd_national').emit('wall_focus', wallFocus)
    res.json(wallFocus)
  })

  return r
}
