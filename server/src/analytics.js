/**
 * Predictive crime & intelligence analytics.
 *
 * Pure scoring/forecast helpers (exported for unit tests) plus a router of
 * jurisdiction-scoped endpoints:
 *   GET /risk-map        — LGA-level risk scores (severity × recency weighted)
 *   GET /hotspots        — emerging hotspots (recent rate vs baseline acceleration)
 *   GET /forecast        — hourly incident forecast + staffing recommendation
 *   GET /incident-trends — type/severity/state breakdown + SLA compliance
 *   GET /officer-safety  — check-in compliance, battery health, SOS response stats
 */
import { Router } from 'express'

export const SEVERITY_WEIGHTS = { low: 1, medium: 3, high: 6, critical: 10 }
export const RISK_BANDS = [
  { band: 'critical', min: 75 },
  { band: 'high', min: 50 },
  { band: 'medium', min: 25 },
  { band: 'low', min: 0 },
]
/** Saturating normalisation constant: score = 100 * raw / (raw + K). */
export const RISK_SATURATION_K = 25
export const RECENCY_HALF_LIFE_HOURS = 12

export function severityWeight(severity, isFlash = false) {
  const base = SEVERITY_WEIGHTS[String(severity).toLowerCase()] ?? 1
  return isFlash ? base * 1.5 : base
}

/** Exponential recency decay: 1 now, 0.5 after one half-life, ~0 at 5 half-lives. */
export function recencyWeight(ageHours, halfLifeHours = RECENCY_HALF_LIFE_HOURS) {
  const age = Number(ageHours)
  if (!Number.isFinite(age) || age < 0) return 0
  return Math.pow(0.5, age / halfLifeHours)
}

export function riskScore(weightedSum) {
  const raw = Number(weightedSum)
  if (!Number.isFinite(raw) || raw <= 0) return 0
  return Math.round((100 * raw) / (raw + RISK_SATURATION_K))
}

export function riskBand(score) {
  const s = Number(score)
  for (const b of RISK_BANDS) if (s >= b.min) return b.band
  return 'low'
}

export function trendLabel(recentCount, previousCount) {
  if (previousCount === 0) return recentCount > 0 ? 'rising' : 'stable'
  const ratio = recentCount / previousCount
  if (ratio >= 1.25) return 'rising'
  if (ratio <= 0.75) return 'falling'
  return 'stable'
}

/**
 * Weighted moving average. `window` most recent points weighted window..1.
 * Returns null when there is no history at all.
 */
export function weightedMovingAverage(series, window = 6) {
  const pts = series.filter((n) => Number.isFinite(n))
  if (!pts.length) return null
  const take = pts.slice(-window)
  let num = 0
  let den = 0
  take.forEach((v, i) => {
    const w = i + 1
    num += v * w
    den += w
  })
  return num / den
}

/**
 * Recursive WMA forecast: each predicted point is appended and the next WMA
 * computed over history + predictions. Flat, mean-reverting, never negative.
 */
export function forecastSeries(history, hours = 6, window = 6) {
  const series = history.filter((n) => Number.isFinite(n))
  const out = []
  let work = [...series]
  for (let i = 0; i < hours; i++) {
    const next = weightedMovingAverage(work, window) ?? 0
    const value = Math.max(0, Math.round(next * 10) / 10)
    out.push(value)
    work = [...work, value]
  }
  return out
}

/** Officers to pre-position for a predicted incident load in a risk band. */
export function staffingRecommendation(predictedIncidents, band) {
  const predicted = Math.max(0, Number(predictedIncidents) || 0)
  const perIncident = 2
  const bandBuffer = band === 'critical' ? 6 : band === 'high' ? 4 : band === 'medium' ? 2 : 0
  return Math.ceil(predicted * perIncident) + bandBuffer
}

/**
 * Hotspot acceleration: recent count vs the count expected from the baseline
 * rate over the same duration. Returns ratio >= 0 (0 when nothing recent).
 */
export function accelerationRatio(recentCount, baselineCount, baselineHours, recentHours) {
  if (!recentCount || recentCount <= 0) return 0
  const safeBaselineHours = Math.max(1, Number(baselineHours) || 1)
  const safeRecentHours = Math.max(0.25, Number(recentHours) || 1)
  const expected = (Number(baselineCount) || 0) * (safeRecentHours / safeBaselineHours)
  return Math.round((recentCount / Math.max(expected, 0.5)) * 100) / 100
}

function clampHours(v, fallback) {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 && n <= 24 * 30 ? Math.round(n) : fallback
}

function scopeClause(scope) {
  if (scope.level === 'area') return { sql: ' AND i.lga_id = $1', params: [scope.lgaId] }
  if (scope.level === 'state') return { sql: ' AND i.state_id = $1', params: [scope.stateId] }
  return { sql: '', params: [] }
}

async function commandScopeOr(pool, req) {
  const r = await pool.query(
    `SELECT jurisdiction_level, jurisdiction_state_id, jurisdiction_lga_id FROM app_users WHERE id = $1`,
    [req.auth.sub],
  )
  const row = r.rows[0]
  if (!row) return { level: 'none' }
  if (row.jurisdiction_level === 'area' && row.jurisdiction_lga_id) return { level: 'area', lgaId: row.jurisdiction_lga_id }
  if (row.jurisdiction_level === 'state' && row.jurisdiction_state_id) return { level: 'state', stateId: row.jurisdiction_state_id }
  return { level: 'national' }
}

export function createAnalyticsRouter({ pool, authMiddleware, requireAnyPortal }) {
  const r = Router()
  const command = requireAnyPortal('management', 'igp', 'admin')

  /** GET /risk-map?hours=72 — LGA risk scores. */
  r.get('/risk-map', authMiddleware, command, async (req, res) => {
    try {
      const hours = clampHours(req.query.hours, 72)
      const scope = await commandScopeOr(pool, req)
      const sc = scopeClause(scope)
      const q = await pool.query(
        `SELECT i.severity, i.is_flash, i.created_at, i.status,
                gl.id AS lga_id, gl.name AS lga_name, gs.id AS state_id, gs.name AS state_name
         FROM incidents i
         JOIN geo_lgas gl ON gl.id = i.lga_id
         JOIN geo_states gs ON gs.id = gl.state_id
         WHERE i.created_at > now() - make_interval(hours => $${sc.params.length + 1})${sc.sql}
         ORDER BY i.created_at DESC LIMIT 20000`,
        [...sc.params, hours],
      )
      const now = Date.now()
      const byLga = new Map()
      const recentStart = now - 8 * 3600_000
      const previousStart = now - 16 * 3600_000
      for (const row of q.rows) {
        const key = row.lga_id
        let agg = byLga.get(key)
        if (!agg) {
          agg = {
            lgaId: row.lga_id, lgaName: row.lga_name, stateId: row.state_id, stateName: row.state_name,
            incidents: 0, criticalCount: 0, recent8h: 0, previous8h: 0, unresolved: 0, raw: 0,
          }
          byLga.set(key, agg)
        }
        const ageHours = (now - new Date(row.created_at).getTime()) / 3600_000
        agg.incidents += 1
        agg.raw += severityWeight(row.severity, row.is_flash) * recencyWeight(ageHours)
        if (row.severity === 'critical') agg.criticalCount += 1
        if (row.status !== 'resolved') agg.unresolved += 1
        const ts = new Date(row.created_at).getTime()
        if (ts >= recentStart) agg.recent8h += 1
        else if (ts >= previousStart) agg.previous8h += 1
      }
      const areas = [...byLga.values()].map((a) => {
        const score = riskScore(a.raw)
        return {
          lgaId: a.lgaId, lgaName: a.lgaName, stateId: a.stateId, stateName: a.stateName,
          score, band: riskBand(score), incidents: a.incidents, criticalIncidents: a.criticalCount,
          unresolved: a.unresolved, recent8h: a.recent8h, previous8h: a.previous8h,
          trend: trendLabel(a.recent8h, a.previous8h),
        }
      })
      areas.sort((x, y) => y.score - x.score)
      return res.json({ windowHours: hours, scope: scope.level, areas })
    } catch (e) {
      console.error('[analytics/risk-map]', e)
      return res.status(500).json({ error: 'Failed to compute risk map' })
    }
  })

  /** GET /hotspots?recentHours=6&baselineHours=24&min=3 — emerging hotspots. */
  r.get('/hotspots', authMiddleware, command, async (req, res) => {
    try {
      const recentHours = clampHours(req.query.recentHours, 6)
      const baselineHours = clampHours(req.query.baselineHours, 24)
      const minRecent = Number.isFinite(Number(req.query.min)) && Number(req.query.min) > 0 ? Number(req.query.min) : 3
      const scope = await commandScopeOr(pool, req)
      const sc = scopeClause(scope)
      const total = recentHours + baselineHours
      const q = await pool.query(
        `SELECT i.type_code, i.severity, i.created_at, i.lat, i.lng,
                gw.id AS ward_id, gw.name AS ward_name,
                gl.id AS lga_id, gl.name AS lga_name, gs.id AS state_id, gs.name AS state_name
         FROM incidents i
         LEFT JOIN geo_wards gw ON gw.id = i.ward_id
         JOIN geo_lgas gl ON gl.id = i.lga_id
         JOIN geo_states gs ON gs.id = gl.state_id
         WHERE i.created_at > now() - make_interval(hours => $${sc.params.length + 1})${sc.sql}
         ORDER BY i.created_at DESC LIMIT 20000`,
        [...sc.params, total],
      )
      const now = Date.now()
      const recentStart = now - recentHours * 3600_000
      const groups = new Map()
      for (const row of q.rows) {
        const key = row.ward_id ?? `lga_${row.lga_id}`
        let g = groups.get(key)
        if (!g) {
          g = {
            wardId: row.ward_id, wardName: row.ward_name ?? `${row.lga_name} (LGA-wide)`,
            lgaId: row.lga_id, lgaName: row.lga_name, stateId: row.state_id, stateName: row.state_name,
            recent: [], baseline: 0, types: new Map(), latSum: 0, lngSum: 0, latN: 0,
          }
          groups.set(key, g)
        }
        const ts = new Date(row.created_at).getTime()
        if (ts >= recentStart) {
          g.recent.push(row)
          g.types.set(row.type_code, (g.types.get(row.type_code) ?? 0) + 1)
          if (row.lat != null && row.lng != null) { g.latSum += row.lat; g.lngSum += row.lng; g.latN += 1 }
        } else {
          g.baseline += 1
        }
      }
      const hotspots = [...groups.values()]
        .map((g) => {
          const topType = [...g.types.entries()].sort((a, b) => b[1] - a[1])[0]
          return {
            wardId: g.wardId,
            wardName: g.wardName,
            lgaId: g.lgaId,
            lgaName: g.lgaName,
            stateId: g.stateId,
            stateName: g.stateName,
            recentCount: g.recent.length,
            baselineCount: g.baseline,
            acceleration: accelerationRatio(g.recent.length, g.baseline, baselineHours, recentHours),
            topType: topType ? { code: topType[0], count: topType[1] } : null,
            centroid: g.latN ? { lat: Math.round((g.latSum / g.latN) * 1e5) / 1e5, lng: Math.round((g.lngSum / g.latN) * 1e5) / 1e5 } : null,
          }
        })
        .filter((h) => h.recentCount >= minRecent && h.acceleration >= 1.5)
        .sort((a, b) => b.recentCount * b.acceleration - a.recentCount * a.acceleration)
        .slice(0, 20)
      return res.json({ recentHours, baselineHours, scope: scope.level, hotspots })
    } catch (e) {
      console.error('[analytics/hotspots]', e)
      return res.status(500).json({ error: 'Failed to compute hotspots' })
    }
  })

  /** GET /forecast?hours=24&predict=6 — hourly history + WMA forecast + staffing. */
  r.get('/forecast', authMiddleware, command, async (req, res) => {
    try {
      const hours = clampHours(req.query.hours, 24)
      const predict = Math.min(24, Math.max(1, Number(req.query.predict) || 6))
      const scope = await commandScopeOr(pool, req)
      const sc = scopeClause(scope)
      const q = await pool.query(
        `SELECT date_trunc('hour', i.created_at) AS bucket, COUNT(*)::int AS count
         FROM incidents i
         WHERE i.created_at > now() - make_interval(hours => $${sc.params.length + 1})${sc.sql}
         GROUP BY 1 ORDER BY 1`,
        [...sc.params, hours],
      )
      const counts = new Map(q.rows.map((row) => [new Date(row.bucket).getTime(), row.count]))
      const history = []
      const nowHour = new Date()
      nowHour.setMinutes(0, 0, 0)
      for (let i = hours - 1; i >= 0; i--) {
        const ts = nowHour.getTime() - i * 3600_000
        history.push(counts.get(ts) ?? 0)
      }
      const forecast = forecastSeries(history, predict)
      const currentBand = riskBand(riskScore(history.slice(-8).reduce((s, n) => s + n * 1.5, 0)))
      const staffing = forecast.map((value, idx) => ({
        hourOffset: idx + 1,
        predictedIncidents: value,
        officers: staffingRecommendation(value, currentBand),
      }))
      const typeQ = await pool.query(
        `SELECT i.type_code, COUNT(*)::int AS count
         FROM incidents i
         WHERE i.created_at > now() - make_interval(hours => $${sc.params.length + 1})${sc.sql}
         GROUP BY 1 ORDER BY 2 DESC LIMIT 5`,
        [...sc.params, hours],
      )
      return res.json({
        windowHours: hours,
        history: history.map((count, idx) => ({ hourOffset: idx - hours + 1, count })),
        forecast: forecast.map((predictedIncidents, idx) => ({ hourOffset: idx + 1, predictedIncidents })),
        staffing,
        riskBand: currentBand,
        topTypes: typeQ.rows.map((t) => ({ code: t.type_code, count: t.count })),
        scope: scope.level,
      })
    } catch (e) {
      console.error('[analytics/forecast]', e)
      return res.status(500).json({ error: 'Failed to compute forecast' })
    }
  })

  /** GET /incident-trends?hours=48 — breakdowns + SLA compliance + escalation mix. */
  r.get('/incident-trends', authMiddleware, command, async (req, res) => {
    try {
      const hours = clampHours(req.query.hours, 48)
      const scope = await commandScopeOr(pool, req)
      const sc = scopeClause(scope)

      const [byType, byTypePrev, bySeverity, byState, esc, sla] = await Promise.all([
        pool.query(`SELECT i.type_code, t.label, COUNT(*)::int AS count, AVG(CASE i.severity WHEN 'low' THEN 1 WHEN 'medium' THEN 3 WHEN 'high' THEN 6 ELSE 10 END)::float AS avg_weight
                    FROM incidents i JOIN incident_types t ON t.code = i.type_code
                    WHERE i.created_at > now() - make_interval(hours => $${sc.params.length + 1})${sc.sql}
                    GROUP BY 1,2 ORDER BY 3 DESC LIMIT 12`, [...sc.params, hours]),
        pool.query(`SELECT i.type_code, COUNT(*)::int AS count
                    FROM incidents i
                    WHERE i.created_at <= now() - make_interval(hours => $${sc.params.length + 1})
                      AND i.created_at > now() - make_interval(hours => $${sc.params.length + 2})${sc.sql}
                    GROUP BY 1`, [...sc.params, hours, hours * 2]),
        pool.query(`SELECT i.severity, COUNT(*)::int AS count FROM incidents i
                    WHERE i.created_at > now() - make_interval(hours => $${sc.params.length + 1})${sc.sql}
                    GROUP BY 1`, [...sc.params, hours]),
        pool.query(`SELECT gs.name AS state_name, COUNT(*)::int AS count, AVG(CASE i.severity WHEN 'low' THEN 1 WHEN 'medium' THEN 3 WHEN 'high' THEN 6 ELSE 10 END)::float AS avg_weight
                    FROM incidents i JOIN geo_states gs ON gs.id = i.state_id
                    WHERE i.created_at > now() - make_interval(hours => $${sc.params.length + 1})${sc.sql}
                    GROUP BY 1 ORDER BY 2 DESC LIMIT 12`, [...sc.params, hours]),
        pool.query(`SELECT i.escalation_level, COUNT(*)::int AS count FROM incidents i
                    WHERE i.created_at > now() - make_interval(hours => $${sc.params.length + 1})${sc.sql}
                    GROUP BY 1`, [...sc.params, hours]),
        pool.query(`SELECT COUNT(*)::int AS total,
                      COUNT(i.acknowledged_at)::int AS acknowledged,
                      COUNT(i.resolved_at)::int AS resolved,
                      AVG(EXTRACT(EPOCH FROM (i.acknowledged_at - i.created_at)) / 60) FILTER (WHERE i.acknowledged_at IS NOT NULL) AS avg_ack_minutes,
                      AVG(EXTRACT(EPOCH FROM (i.resolved_at - i.created_at)) / 60) FILTER (WHERE i.resolved_at IS NOT NULL) AS avg_resolve_minutes,
                      COUNT(CASE WHEN i.acknowledged_at IS NOT NULL AND (i.sla_due_at IS NULL OR i.acknowledged_at <= i.sla_due_at) THEN 1 END)::int AS within_sla
                    FROM incidents i
                    WHERE i.created_at > now() - make_interval(hours => $${sc.params.length + 1})${sc.sql}`, [...sc.params, hours]),
      ])

      const prevByType = new Map(byTypePrev.rows.map((r2) => [r2.type_code, r2.count]))
      const s = sla.rows[0] ?? {}
      return res.json({
        windowHours: hours,
        scope: scope.level,
        byType: byType.rows.map((t) => ({
          code: t.type_code, label: t.label, count: t.count,
          previousCount: prevByType.get(t.type_code) ?? 0,
          trend: trendLabel(t.count, prevByType.get(t.type_code) ?? 0),
        })),
        bySeverity: bySeverity.rows,
        byState: byState.rows.map((x) => ({ state: x.state_name, count: x.count, avgWeight: Math.round((x.avg_weight ?? 0) * 10) / 10 })),
        escalationMix: esc.rows,
        sla: {
          total: s.total ?? 0,
          acknowledged: s.acknowledged ?? 0,
          resolved: s.resolved ?? 0,
          withinSla: s.within_sla ?? 0,
          slaCompliancePct: s.total ? Math.round(((s.within_sla ?? 0) / s.total) * 100) : null,
          avgAckMinutes: s.avg_ack_minutes != null ? Math.round(s.avg_ack_minutes) : null,
          avgResolveMinutes: s.avg_resolve_minutes != null ? Math.round(s.avg_resolve_minutes) : null,
        },
      })
    } catch (e) {
      console.error('[analytics/incident-trends]', e)
      return res.status(500).json({ error: 'Failed to compute incident trends' })
    }
  })

  /** GET /officer-safety?hours=24 — check-in compliance, battery, SOS response. */
  r.get('/officer-safety', authMiddleware, command, async (req, res) => {
    try {
      const hours = clampHours(req.query.hours, 24)
      const scope = await commandScopeOr(pool, req)
      const geoScope = scope.level === 'area'
        ? { join: 'LEFT JOIN geo_wards gwd ON gwd.id = gp2.ward_id LEFT JOIN geo_lgas gl ON gl.id = gwd.lga_id', where: ' AND gl.id = $1', params: [scope.lgaId] }
        : scope.level === 'state'
          ? { join: 'LEFT JOIN geo_wards gwd ON gwd.id = gp2.ward_id LEFT JOIN geo_lgas gl ON gl.id = gwd.lga_id', where: ' AND gl.state_id = $1', params: [scope.stateId] }
          : { join: 'LEFT JOIN geo_wards gwd ON gwd.id = gp2.ward_id LEFT JOIN geo_lgas gl ON gl.id = gwd.lga_id', where: '', params: [] }

      const [checkins, sos] = await Promise.all([
        pool.query(
          `SELECT os.user_id, os.interval_minutes, os.last_ok_at, os.next_due_at, os.battery_pct, os.network,
                  u.username, coalesce(op.full_name, u.username) AS officer_name
           FROM officer_safety os
           JOIN app_users u ON u.id = os.user_id
           LEFT JOIN officer_profiles op ON op.user_id = os.user_id
           LEFT JOIN geo_polling_units gp2 ON gp2.id = op.assigned_polling_unit_id
           ${geoScope.join}
           WHERE os.last_ok_at > now() - make_interval(hours => $${geoScope.params.length + 1})`,
          [...geoScope.params, hours * 3],
        ),
        pool.query(
          `SELECT s.id, s.status, s.started_at, s.resolved_at, gs.name AS state_name
           FROM sos_alerts s
           LEFT JOIN officer_profiles op ON op.user_id = s.user_id
           LEFT JOIN geo_polling_units gp ON gp.id = op.assigned_polling_unit_id
           LEFT JOIN geo_wards gw ON gw.id = gp.ward_id
           LEFT JOIN geo_lgas gl ON gl.id = gw.lga_id
           LEFT JOIN geo_states gs ON gs.id = gl.state_id
           WHERE s.started_at > now() - make_interval(hours => $1)
             ${scope.level === 'area' ? ' AND gl.id = $2' : scope.level === 'state' ? ' AND gl.state_id = $2' : ''}`,
          scope.level === 'national' ? [hours] : [hours, scope.level === 'area' ? scope.lgaId : scope.stateId],
        ),
      ])

      const rows = checkins.rows
      const compliant = rows.filter((x) => {
        const intervalMin = x.interval_minutes ?? 60
        const dueMs = (intervalMin + 10) * 60_000
        return x.last_ok_at && Date.now() - new Date(x.last_ok_at).getTime() <= dueMs
      })
      const withBattery = rows.filter((x) => x.battery_pct != null)
      const batteryBands = { critical: 0, low: 0, moderate: 0, healthy: 0 }
      for (const x of withBattery) {
        const b = x.battery_pct
        if (b < 20) batteryBands.critical += 1
        else if (b < 50) batteryBands.low += 1
        else if (b < 80) batteryBands.moderate += 1
        else batteryBands.healthy += 1
      }
      const resolvedSos = sos.rows.filter((x) => x.resolved_at && x.started_at)
      const responseMinutes = resolvedSos
        .map((x) => (new Date(x.resolved_at).getTime() - new Date(x.started_at).getTime()) / 60_000)
        .filter((m) => Number.isFinite(m) && m >= 0)
      const byState = new Map()
      for (const x of sos.rows) {
        const key = x.state_name ?? 'Unknown'
        byState.set(key, (byState.get(key) ?? 0) + 1)
      }
      return res.json({
        windowHours: hours,
        scope: scope.level,
        checkin: {
          officersReporting: rows.length,
          compliant: compliant.length,
          compliancePct: rows.length ? Math.round((compliant.length / rows.length) * 100) : null,
          overdue: rows.filter((x) => !compliant.includes(x)).length,
        },
        battery: {
          reporting: withBattery.length,
          bands: batteryBands,
          lowest: withBattery.length ? Math.min(...withBattery.map((x) => x.battery_pct)) : null,
        },
        sos: {
          total: sos.rows.length,
          active: sos.rows.filter((x) => x.status === 'active').length,
          avgResponseMinutes: responseMinutes.length ? Math.round(responseMinutes.reduce((a, b) => a + b, 0) / responseMinutes.length) : null,
          byState: [...byState.entries()].map(([state, count]) => ({ state, count })).sort((a, b) => b.count - a.count),
        },
      })
    } catch (e) {
      console.error('[analytics/officer-safety]', e)
      return res.status(500).json({ error: 'Failed to compute officer safety analytics' })
    }
  })

  return r
}
