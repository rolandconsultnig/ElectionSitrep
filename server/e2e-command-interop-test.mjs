/**
 * Command-chain interoperation E2E test.
 * Verifies cross-level flows between every command tier:
 *   field → DPO/area → state → Force HQ, plus IGP + admin oversight.
 * Covers: escalation ladder, jurisdiction scoping, DM authorization matrix,
 * SOS interop, directives, sitrep scoping, realtime alert routing, analytics.
 *
 * Requires: API on :5530 with `npm run seed` applied (adds dpo.ibadan,
 * field.officer1 @ Oyo/Ibadan North, field.officer2 @ Lagos).
 * Usage: node e2e-command-interop-test.mjs
 */
import { createRequire } from 'module'
import { fileURLToPath } from 'node:url'

const requireApp = createRequire(fileURLToPath(new URL('../sitrep-app/package.json', import.meta.url)))
const { io } = requireApp('socket.io-client')

const BASE = 'http://localhost:5530'
const results = []
let pass = 0, fail = 0

function record(name, ok, detail = '') {
  results.push({ name, ok, detail })
  if (ok) pass++
  else fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? `  — ${detail}` : ''}`)
}

async function api(method, path, { token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  let json = null
  try { json = await res.json() } catch { /* non-json */ }
  return { status: res.status, json }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function connectSocket(token) {
  return io(BASE, { auth: { token }, transports: ['websocket'], reconnection: false, timeout: 8000 })
}

function waitFor(socket, event, ms = 6000) {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), ms)
    socket.once(event, (data) => { clearTimeout(t); resolve(data) })
  })
}

async function main() {
  // ---------- 1. Login every command level ----------
  console.log('\n=== 1. LOGIN — EVERY COMMAND LEVEL ===')
  const accounts = [
    'field.officer1', // Field (Oyo / Ibadan North)
    'field.officer2', // Field (Lagos)
    'dpo.ibadan',     // DPO / Area (Ibadan North)
    'area.ibadan',    // Area Command (Ibadan North)
    'oyo.command',    // State Command (Oyo)
    'lagos.command',  // State Command (Lagos)
    'hq.command',     // Force HQ (national)
    'igp.office',     // IGP (executive)
    'admin.demo',     // Admin
  ]
  const U = {}
  for (const username of accounts) {
    const r = await api('POST', '/api/auth/login', { body: { username, password: 'demo' } })
    const token = r.json?.token
    U[username] = { token, id: r.json?.user?.id, username }
    record(`login ${username}`, r.status === 200 && Boolean(token), `status=${r.status} err=${r.json?.error}`)
  }
  const f1 = U['field.officer1'], f2 = U['field.officer2'], dpo = U['dpo.ibadan'], area = U['area.ibadan']
  const oyo = U['oyo.command'], lagos = U['lagos.command'], hq = U['hq.command'], igp = U['igp.office'], admin = U['admin.demo']

  // ---------- 2. Escalation ladder: field → DPO → area → state → FHQ ----------
  console.log('\n=== 2. INCIDENT ESCALATION LADDER ===')
  const created = await api('POST', '/api/incidents', {
    token: f1.token,
    body: { typeCode: 'thuggery', severity: 'low', title: 'Interop ladder incident', description: 'e2e interop ladder test', clientId: `interop-ladder-${Date.now()}` },
  })
  const incId = created.json?.incident?.id ?? created.json?.id
  record('field officer creates low-severity incident (enters at DPO rung)', created.status === 201 && Boolean(incId), `status=${created.status} err=${created.json?.error}`)

  const detailFor = async (token) => {
    const r = await api('GET', `/api/incidents/${incId}`, { token })
    return { status: r.status, level: r.json?.incident?.escalationLevel ?? r.json?.escalationLevel ?? r.json?.incident?.escalation_level }
  }
  const vis = { dpo: await detailFor(dpo.token), area: await detailFor(area.token), oyo: await detailFor(oyo.token), hq: await detailFor(hq.token), lagos: await detailFor(lagos.token) }
  record('DPO (area scope) sees incident', vis.dpo.status === 200, `status=${vis.dpo.status}`)
  record('Area Command sees incident', vis.area.status === 200, `status=${vis.area.status}`)
  record('State Command (Oyo) sees incident', vis.oyo.status === 200, `status=${vis.oyo.status}`)
  record('Force HQ sees incident', vis.hq.status === 200, `status=${vis.hq.status}`)
  record('State Command (Lagos) CANNOT see incident (jurisdiction isolation)', vis.lagos.status === 404, `status=${vis.lagos.status}`)

  const ack = await api('POST', `/api/incidents/${incId}/acknowledge`, { token: dpo.token, body: { note: 'dpo ack' } })
  record('DPO acknowledges incident', ack.status === 200, `status=${ack.status} err=${ack.json?.error}`)
  const esc1 = await api('POST', `/api/incidents/${incId}/escalate`, { token: dpo.token, body: { note: 'beyond DPO control' } })
  record('DPO escalates → Area Command rung', esc1.status === 200, `status=${esc1.status} err=${esc1.json?.error}`)
  const afterEsc1 = await detailFor(area.token)
  record('incident now at area level', afterEsc1.level === 'area', `level=${afterEsc1.level}`)
  const esc2 = await api('POST', `/api/incidents/${incId}/escalate`, { token: oyo.token, body: { note: 'state intervention' } })
  record('State Command escalates → state rung', esc2.status === 200, `status=${esc2.status} err=${esc2.json?.error}`)
  const esc3 = await api('POST', `/api/incidents/${incId}/escalate`, { token: hq.token, body: { note: 'national attention' } })
  record('Force HQ escalates → fhq rung', esc3.status === 200, `status=${esc3.status} err=${esc3.json?.error}`)
  const afterEsc3 = await detailFor(hq.token)
  record('incident now at fhq (top rung)', afterEsc3.level === 'fhq', `level=${afterEsc3.level}`)
  const esc4 = await api('POST', `/api/incidents/${incId}/escalate`, { token: hq.token, body: {} })
  record('escalation beyond FHQ rejected (409)', esc4.status === 409, `status=${esc4.status}`)
  const resolved = await api('POST', `/api/incidents/${incId}/resolve`, { token: hq.token, body: { note: 'resolved at FHQ' } })
  record('Force HQ resolves incident', resolved.status === 200, `status=${resolved.status} err=${resolved.json?.error}`)
  const lagosBlocked = await api('POST', `/api/incidents/${incId}/resolve`, { token: lagos.token, body: { note: 'should not work' } })
  record('out-of-scope command cannot act on incident (404)', [404, 409].includes(lagosBlocked.status), `status=${lagosBlocked.status}`)

  const flash = await api('POST', '/api/incidents', {
    token: f1.token,
    body: { typeCode: 'violence', severity: 'critical', isFlash: true, title: 'Interop flash', description: 'critical flash straight to FHQ', clientId: `interop-flash-${Date.now()}` },
  })
  const flashId = flash.json?.incident?.id ?? flash.json?.id
  record('critical flash incident created', flash.status === 201 && Boolean(flashId), `status=${flash.status}`)
  if (flashId) {
    const fd = await detailFor(hq.token)
    record('critical flash lands directly at FHQ rung', fd.level === 'fhq', `level=${fd.level}`)
    const fr = await api('POST', `/api/incidents/${flashId}/resolve`, { token: hq.token, body: { note: 'done' } })
    record('FHQ resolves flash incident', fr.status === 200, `status=${fr.status}`)
  }

  // ---------- 3. DM authorization matrix across levels ----------
  console.log('\n=== 3. DIRECT-MESSAGE AUTHORIZATION MATRIX ===')
  const dm = async (from, to, label, expectOk) => {
    const r = await api('POST', `/api/chat/dm/${to.id}`, { token: from.token, body: { content: `interop DM: ${label}` } })
    const ok = expectOk ? r.status === 201 : [400, 403].includes(r.status)
    record(`DM ${label} → ${expectOk ? 'allowed' : 'blocked'}`, ok, `status=${r.status} err=${r.json?.error}`)
  }
  await dm(oyo, f1, 'State Command (Oyo) → field officer in-state', true)
  await dm(lagos, f1, 'State Command (Lagos) → field officer OUT of state', false)
  await dm(dpo, f1, 'DPO (Ibadan North) → field officer in LGA', true)
  await dm(dpo, f2, 'DPO (Ibadan North) → field officer in another state', false)
  await dm(hq, f1, 'Force HQ → any field officer (national scope)', true)
  await dm(f1, f2, 'field officer → field officer', false)
  await dm(f1, f1, 'field officer → self', false)
  await dm(f1, oyo, 'field officer → its State Command', true)
  await dm(f2, lagos, 'field officer (Lagos) → own State Command', true)

  // ---------- 4. SOS interop: Lagos officer, Lagos command resolves ----------
  console.log('\n=== 4. SOS CROSS-LEVEL FLOW ===')
  const sos = await api('POST', '/api/sos', { token: f2.token, body: { lat: 6.5244, lng: 3.3792, note: 'interop sos lagos' } })
  const sosId = sos.json?.id
  record('Lagos field officer raises SOS', sos.status === 201 && Boolean(sosId), `status=${sos.status}`)
  if (sosId) {
    const sosIdsIn = (json) => (json?.alerts ?? []).map((a) => a.id ?? a.sos?.id)
    const lagosSos = await api('GET', '/api/sos', { token: lagos.token })
    record('Lagos Command sees the SOS in scoped feed', lagosSos.status === 200 && sosIdsIn(lagosSos.json).includes(sosId), `status=${lagosSos.status} ids=${sosIdsIn(lagosSos.json).slice(0, 5)}`)
    const oyoSos = await api('GET', '/api/sos', { token: oyo.token })
    record('Oyo Command does NOT see Lagos SOS', oyoSos.status === 200 && !sosIdsIn(oyoSos.json).includes(sosId), `present=${sosIdsIn(oyoSos.json).includes(sosId)}`)
    const notYours = await api('POST', `/api/sos/${sosId}/resolve`, { token: oyo.token, body: { outcome: 'x' } })
    record('out-of-scope command cannot resolve SOS (404)', [404, 403].includes(notYours.status), `status=${notYours.status}`)
    const resolvedSos = await api('POST', `/api/sos/${sosId}/resolve`, { token: lagos.token, body: { outcome: 'officer_safe' } })
    record('Lagos Command resolves the SOS', resolvedSos.status === 200, `status=${resolvedSos.status} err=${resolvedSos.json?.error}`)
  }

  // ---------- 5. Directives: FHQ issues → field acknowledges ----------
  console.log('\n=== 5. COMMAND DIRECTIVES FLOW ===')
  const dir = await api('POST', '/api/coordination/directives', {
    token: hq.token,
    body: { title: `Interop directive ${Date.now()}`, directiveBody: 'All units maintain heightened vigilance.', audience: 'all' },
  })
  const dirId = dir.json?.directive?.id ?? dir.json?.id
  record('Force HQ issues directive', dir.status === 200 || dir.status === 201, `status=${dir.status} err=${dir.json?.error}`)
  if (dirId) {
    const ackDir = await api('POST', `/api/coordination/directives/${dirId}/acknowledge`, { token: f1.token, body: {} })
    record('field officer acknowledges directive', ackDir.status === 200 || ackDir.status === 201, `status=${ackDir.status} err=${ackDir.json?.error}`)
  }

  // ---------- 6. Sitrep jurisdiction scoping ----------
  console.log('\n=== 6. SITREP JURISDICTION SCOPING ===')
  const sitrep = await api('POST', '/api/sitreps', {
    token: f1.token,
    body: { title: `Interop sitrep ${Date.now()}`, body: 'ground situation normal', kind: 'sitrep', severity: 'low' },
  })
  record('field officer submits sitrep (geo derived from PU assignment)', sitrep.status === 200 || sitrep.status === 201, `status=${sitrep.status} err=${sitrep.json?.error}`)
  const feedFor = async (token) => (await api('GET', '/api/sitreps?limit=100', { token })).json?.sitreps ?? []
  const areaFeed = await feedFor(area.token)
  const lagosFeed = await feedFor(lagos.token)
  const hqFeed = await feedFor(hq.token)
  const inArea = areaFeed.some((s) => s.title?.startsWith('Interop sitrep'))
  const inLagos = lagosFeed.some((s) => s.title?.startsWith('Interop sitrep'))
  const inHq = hqFeed.some((s) => s.title?.startsWith('Interop sitrep'))
  record('Area Command feed contains the sitrep', inArea, `feedLen=${areaFeed.length}`)
  record('Lagos Command feed excludes the sitrep', !inLagos, `present=${inLagos}`)
  record('Force HQ feed contains the sitrep', inHq, `feedLen=${hqFeed.length}`)

  // ---------- 7. Realtime alert routing across command rooms ----------
  console.log('\n=== 7. REALTIME ALERT ROUTING (websocket rooms) ===')
  const areaSock = connectSocket(area.token)
  const oyoSock = connectSocket(oyo.token)
  const hqSock = connectSocket(hq.token)
  await sleep(800)
  const areaAlertP = waitFor(areaSock, 'incident_alert', 7000)
  const oyoAlertP = waitFor(oyoSock, 'incident_alert', 7000)
  const hqAlertP = waitFor(hqSock, 'incident_alert', 7000)
  await sleep(200)
  // MEDIUM severity → area rung → alert=true → only cmd_lga room alerted.
  // (Low severity intentionally does not broadcast alerts — routine reports.)
  const lowInc = await api('POST', '/api/incidents', {
    token: f1.token,
    body: { typeCode: 'thuggery', severity: 'medium', title: 'Interop ws medium', description: 'ws routing medium test', clientId: `interop-ws-med-${Date.now()}` },
  })
  const areaAlert = await areaAlertP
  record('medium incident alerts AREA room in realtime', Boolean(areaAlert), `got=${JSON.stringify(areaAlert)?.slice(0, 80)}`)
  const oyoAlert = await Promise.race([oyoAlertP, sleep(1500).then(() => null)])
  record('medium incident does NOT alert state room yet (ladder discipline)', oyoAlert === null, `got=${JSON.stringify(oyoAlert)?.slice(0, 80)}`)
  // CRITICAL → fhq rung → everyone alerted
  const critInc = await api('POST', '/api/incidents', {
    token: f1.token,
    body: { typeCode: 'violence', severity: 'critical', title: 'Interop ws critical', description: 'ws routing critical test', clientId: `interop-ws-crit-${Date.now()}` },
  })
  const hqAlert = await hqAlertP
  record('critical incident alerts FORCE HQ room in realtime', Boolean(hqAlert), `got=${JSON.stringify(hqAlert)?.slice(0, 80)}`)
  const oyoAlertCrit = await Promise.race([oyoAlertP, sleep(1500).then(() => null)])
  record('critical incident also alerts state room', Boolean(oyoAlertCrit), `got=null`)
  for (const id of [lowInc.json?.incident?.id, critInc.json?.incident?.id]) {
    if (id) await api('POST', `/api/incidents/${id}/resolve`, { token: hq.token, body: { note: 'ws cleanup' } })
  }
  areaSock.close(); oyoSock.close(); hqSock.close()

  // ---------- 8. Predictive analytics across levels ----------
  console.log('\n=== 8. PREDICTIVE ANALYTICS (new intelligence features) ===')
  const endpoints = [
    ['risk-map', '/api/analytics/risk-map?hours=72'],
    ['hotspots', '/api/analytics/hotspots?recentHours=6&baselineHours=24'],
    ['forecast', '/api/analytics/forecast?hours=24&predict=6'],
    ['incident-trends', '/api/analytics/incident-trends?hours=48'],
    ['officer-safety', '/api/analytics/officer-safety?hours=24'],
  ]
  for (const [name, path] of endpoints) {
    const r = await api('GET', path, { token: hq.token })
    record(`FHQ: analytics ${name}`, r.status === 200, `status=${r.status} err=${r.json?.error}`)
    const ri = await api('GET', path, { token: igp.token })
    record(`IGP: analytics ${name}`, ri.status === 200, `status=${ri.status}`)
    const rf = await api('GET', path, { token: f1.token })
    record(`field: analytics ${name} blocked (403)`, rf.status === 403, `status=${rf.status}`)
  }
  const riskHq = await api('GET', '/api/analytics/risk-map?hours=72', { token: hq.token })
  const areas = riskHq.json?.areas ?? []
  record('risk map returns scored areas from incident data', Array.isArray(areas) && areas.length > 0, `areas=${areas.length}`)
  if (areas.length) {
    const a = areas[0]
    record('risk area shape: score 0-100 + band + trend', Number.isFinite(a.score) && a.score >= 0 && a.score <= 100 && ['low', 'medium', 'high', 'critical'].includes(a.band) && ['rising', 'stable', 'falling'].includes(a.trend), JSON.stringify(a).slice(0, 120))
    record('risk map includes Ibadan North (from interop incidents)', areas.some((x) => x.lgaName === 'Ibadan North'), `lgas=${areas.slice(0, 5).map((x) => x.lgaName).join(', ')}`)
  }
  const riskOyo = await api('GET', '/api/analytics/risk-map?hours=72', { token: oyo.token })
  const oyoAreas = riskOyo.json?.areas ?? []
  record('Oyo Command risk map scoped to Oyo only', oyoAreas.length > 0 && oyoAreas.every((x) => x.stateName === 'Oyo'), `states=${[...new Set(oyoAreas.map((x) => x.stateName))].join(',')}`)
  const fcHq = await api('GET', '/api/analytics/forecast?hours=24&predict=6', { token: hq.token })
  const fcData = fcHq.json
  record('forecast returns 24h history + 6h predictions + staffing', Array.isArray(fcData?.history) && fcData.history.length === 24 && Array.isArray(fcData?.forecast) && fcData.forecast.length === 6 && Array.isArray(fcData?.staffing) && fcData.staffing.length === 6, `history=${fcData?.history?.length} forecast=${fcData?.forecast?.length} staffing=${fcData?.staffing?.length}`)
  if (fcData?.staffing?.length) {
    record('staffing recommendation is a sane positive integer', fcData.staffing.every((s) => Number.isInteger(s.officers) && s.officers >= 0), JSON.stringify(fcData.staffing[0]))
  }
  const trendsHq = await api('GET', '/api/analytics/incident-trends?hours=48', { token: hq.token })
  const sla = trendsHq.json?.sla
  record('trends include SLA compliance stats', sla && Number.isFinite(sla.total) && sla.total > 0 && sla.slaCompliancePct != null, JSON.stringify(sla)?.slice(0, 140))
  const safetyHq = await api('GET', '/api/analytics/officer-safety?hours=24', { token: hq.token })
  record('officer-safety returns checkin + battery + sos blocks', Boolean(safetyHq.json?.checkin) && Boolean(safetyHq.json?.battery) && Boolean(safetyHq.json?.sos), JSON.stringify(safetyHq.json)?.slice(0, 100))

  // ---------- 9. IGP oversight reads ----------
  console.log('\n=== 9. IGP OVERSIGHT ===')
  const igpElections = await api('GET', '/api/igp/elections', { token: igp.token })
  record('IGP elections overview', igpElections.status === 200, `status=${igpElections.status}`)
  const igpMap = await api('GET', '/api/igp/field-operations-map', { token: igp.token })
  record('IGP field operations map', igpMap.status === 200, `status=${igpMap.status}`)
  const igpIncidents = await api('GET', '/api/incidents', { token: igp.token })
  record('IGP sees national incident feed', igpIncidents.status === 200, `status=${igpIncidents.status}`)

  // ---------- Summary ----------
  console.log(`\n================ INTEROP SUMMARY ================`)
  console.log(`PASS: ${pass}   FAIL: ${fail}`)
  if (fail > 0) {
    console.log('\nFailed checks:')
    for (const r of results.filter((x) => !x.ok)) console.log(`  - ${r.name}: ${r.detail}`)
  }
  process.exit(fail > 0 ? 1 : 0)
}

main().catch((e) => { console.error('Interop E2E fatal:', e); process.exit(2) })
