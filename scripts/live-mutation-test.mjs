/**
 * Live end-to-end mutation test for Election SitRep field-portal flows.
 * Writes LIVETEST-marked rows through the real HTTP API, verifies reads,
 * and captures pre-existing rows to scripts/.livetest-restore.json so the
 * cleanup script can restore them. ALWAYS run live-mutation-cleanup.mjs after.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pool } from '../server/src/db.js'

const BASE = process.env.SITREP_API || 'http://localhost:5530'
const MARK = 'LIVETEST'
const restore = { votes: null, milestone: null, ec8a: null }
const results = []

function check(name, cond, extra = '') {
  results.push({ name, pass: !!cond })
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`)
}

async function api(token, method, p, body) {
  const res = await fetch(`${BASE}${p}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  let json = null
  try { json = await res.json() } catch { /* no body */ }
  return { status: res.status, json }
}

async function main() {
  // ---------- auth ----------
  const admin = await api(null, 'POST', '/api/auth/login', { username: 'admin.demo', password: 'demo' })
  check('login admin.demo', admin.status === 200 && admin.json?.token, `status=${admin.status}`)
  const field = await api(null, 'POST', '/api/auth/login', { username: 'field.officer1', password: 'demo' })
  check('login field.officer1', field.status === 200 && field.json?.token, `status=${field.status}`)
  const cmd = await api(null, 'POST', '/api/auth/login', { username: 'hq.command', password: 'demo' })
  check('login hq.command', cmd.status === 200 && cmd.json?.token, `status=${cmd.status}`)
  if (!field.json?.token) throw new Error('field login failed — aborting')
  const FT = field.json.token
  const CT = cmd.json?.token

  // ---------- context ----------
  const ctx = await api(FT, 'GET', '/api/field/context')
  const assignment = ctx.json?.assignment
  const puId = assignment?.pollingUnit?.id
  const electionSlug = ctx.json?.activeElections?.[0]?.slug
  check('GET /api/field/context', ctx.status === 200 && Boolean(puId), `pu=${puId} election=${electionSlug}`)
  check('context has nationalPulse (M13)', Array.isArray(ctx.json?.nationalPulse?.labels))

  // ---------- incident types ----------
  const types = await api(FT, 'GET', '/api/incident-types')
  const typeCode = types.json?.types?.[0]?.code
  check('GET /api/incident-types', types.status === 200 && Boolean(typeCode), `using ${typeCode}`)

  // ---------- M11: sitrep via offline-sync batch ----------
  const sitrepClientId = `livetest-sitrep-${Date.now()}`
  const sitrep = await api(FT, 'POST', '/api/field/sync', {
    items: [{
      clientId: sitrepClientId,
      kind: 'sitrep',
      createdAt: new Date().toISOString(),
      payload: { severity: 'GREEN', securityStatus: 'Peaceful', observedIncident: 'None', narrative: `${MARK} sitrep sync`, puId, puCode: assignment?.pollingUnit?.code },
    }],
  })
  check('M11 POST /api/field/sync (sitrep)', sitrep.status === 200 && sitrep.json?.results?.[0]?.ok === true, JSON.stringify(sitrep.json?.results))
  // idempotency check — same clientId again must not duplicate
  const sitrep2 = await api(FT, 'POST', '/api/field/sync', {
    items: [{ clientId: sitrepClientId, kind: 'sitrep', createdAt: new Date().toISOString(), payload: { severity: 'GREEN' } }],
  })
  check('M11 sync idempotent (same clientId)', sitrep2.json?.results?.[0]?.ok === true && sitrep2.json?.results?.[0]?.duplicate === true)

  // command-side read-back of the sitrep feed
  if (CT) {
    const feed = await api(CT, 'GET', '/api/sitreps?limit=50')
    const found = (feed.json?.sitreps ?? []).some((s) => (s.body ?? '').includes(MARK))
    check('M11 sitrep visible in command feed', feed.status === 200 && found)
  }

  // ---------- M14: incident via sync + command visibility ----------
  const incClientId = `livetest-inc-${Date.now()}`
  const inc = await api(FT, 'POST', '/api/field/sync', {
    items: [{
      clientId: incClientId,
      kind: 'incident',
      createdAt: new Date().toISOString(),
      payload: { typeCode, severity: 'low', isFlash: false, description: `${MARK} incident report`, lat: 7.3775, lng: 3.9470 },
    }],
  })
  check('M14 POST /api/field/sync (incident)', inc.status === 200 && inc.json?.results?.[0]?.ok === true, JSON.stringify(inc.json?.results))

  const mine = await api(FT, 'GET', '/api/incidents/mine')
  const myInc = (mine.json?.incidents ?? []).find((i) => i.description?.includes(MARK))
  check('M14/M17 GET /api/incidents/mine shows it', mine.status === 200 && Boolean(myInc), `id=${myInc?.id}`)

  if (CT) {
    const list = await api(CT, 'GET', '/api/incidents?status=active&limit=300')
    const visible = (list.json?.incidents ?? []).some((i) => i.description?.includes(MARK))
    check('M14 incident visible to command', list.status === 200 && visible)
    if (myInc && CT) {
      const ack = await api(CT, 'POST', `/api/incidents/${myInc.id}/acknowledge`, { note: `${MARK} ack` })
      check('command acknowledge incident', ack.status === 200, `status=${ack.status}`)
    }
  }

  // ---------- M15: violence via sync ----------
  const vio = await api(FT, 'POST', '/api/field/sync', {
    items: [{ clientId: `livetest-vio-${Date.now()}`, kind: 'violence', createdAt: new Date().toISOString(), payload: { level: 'URGENT', detail: `${MARK} violence`, puId } }],
  })
  check('M15 POST /api/field/sync (violence)', vio.status === 200 && vio.json?.results?.[0]?.ok === true, JSON.stringify(vio.json?.results))

  // ---------- M15b: safety check-in + duress pin + SOS ----------
  const safety = await api(FT, 'POST', '/api/safety/checkin', { lat: 7.3775, lng: 3.9470, batteryPct: 88, network: '4g' })
  check('M15b POST /api/safety/checkin', safety.status === 200, `status=${safety.status}`)

  const pinSet = await api(FT, 'PUT', '/api/me/duress-pin', { pin: '246810' })
  const pinGet = await api(FT, 'GET', '/api/me/duress-pin')
  const pinClear = await api(FT, 'PUT', '/api/me/duress-pin', { pin: null })
  check('M15b duress PIN set/read/clear', pinSet.status === 200 && pinGet.json?.enabled === true && pinClear.status === 200)

  const sos = await api(FT, 'POST', '/api/sos', { kind: 'panic', lat: 7.3775, lng: 3.9470, accuracy: 12, note: MARK })
  const sosId = sos.json?.sos?.id ?? sos.json?.id
  check('M15b POST /api/sos (panic)', sos.status === 200 || sos.status === 201, `status=${sos.status} id=${sosId}`)
  if (sosId) {
    await api(FT, 'POST', `/api/sos/${sosId}/location`, { lat: 7.3776, lng: 3.9471 })
    if (CT) {
      const sosList = await api(CT, 'GET', '/api/sos')
      const seen = (sosList.json?.alerts ?? []).some((a) => Number(a.id) === Number(sosId))
      check('M15b SOS visible to command', sosList.status === 200 && seen)
      const res = await api(CT, 'POST', `/api/sos/${sosId}/resolve`, { note: `${MARK} resolved` })
      check('M15b SOS resolve by command', res.status === 200, `status=${res.status}`)
    }
  }

  // ---------- P2-01: timeline milestone ----------
  if (puId && electionSlug) {
    const pre = await pool.query(
      `SELECT m.* FROM pu_operational_milestones m JOIN elections e ON e.id = m.election_id
       WHERE e.slug = $1 AND m.polling_unit_id = $2 AND m.milestone = 'materials_received'`, [electionSlug, puId])
    if (pre.rows.length) restore.milestone = pre.rows[0]
    const ms = await api(FT, 'POST', '/api/operations/timeline/milestone', {
      electionSlug, pollingUnitId: puId, milestone: 'materials_received', notes: `${MARK} milestone`,
    })
    check('P2-01 POST timeline milestone', ms.status === 200 && ms.json?.ok === true, `status=${ms.status}`)
    const puMs = await api(FT, 'GET', `/api/operations/timeline/pu/${puId}?electionSlug=${encodeURIComponent(electionSlug)}`)
    const hasMs = (puMs.json?.milestones ?? []).some((m) => m.milestone === 'materials_received')
    check('P2-01 GET timeline/pu read-back', puMs.status === 200 && hasMs)
  }

  // ---------- P2-02: EC8A evidence (upserts UNIQUE(election,pu,photo_source)) ----------
  if (puId && electionSlug) {
    const pre = await pool.query(
      `SELECT * FROM ec8a_results_evidence e JOIN elections el ON el.id = e.election_id
       WHERE el.slug = $1 AND e.polling_unit_id = $2 AND e.photo_source = 'police'`, [electionSlug, puId])
    if (pre.rows.length) restore.ec8a = pre.rows[0]
    const ec8a = await api(FT, 'POST', '/api/operations/results/ec8a', {
      electionSlug, pollingUnitId: puId,
      registeredVoters: 100, accreditedVoters: 12, validVotes: 11, totalVotesCast: 11,
      partyVotes: {}, photoUrl: '', photoHashSha256: 'LIVETESTHASH0000000000000000000000000000000000000000000000000000',
      photoSource: 'police', observerName: MARK,
    })
    check('P2-02 POST EC8A evidence', ec8a.status === 200, `status=${ec8a.status} ${ec8a.json?.error ?? ''}`)
  }

  // ---------- P2-03: sensitive materials register + scan + trail ----------
  const mat = await api(FT, 'POST', '/api/operations/materials', {
    electionSlug, materialType: 'bvas', serialOrBarcode: `${MARK}-BVAS-001`, pollingUnitId: puId,
    carrierName: MARK, notes: MARK,
  })
  const matId = mat.json?.material?.id ?? mat.json?.id
  check('P2-03 POST materials register', mat.status === 200, `status=${mat.status} id=${matId} ${mat.json?.error ?? ''}`)
  const scan = await api(FT, 'POST', '/api/operations/materials/scan', {
    serialOrBarcode: `${MARK}-BVAS-001`, action: 'scan', status: 'at_pu', notes: MARK, lat: 7.3775, lng: 3.9470,
  })
  check('P2-03 POST materials scan', scan.status === 200, `status=${scan.status} ${scan.json?.error ?? ''}`)
  if (matId) {
    const trail = await api(FT, 'GET', `/api/operations/materials/${matId}/trail`)
    check('P2-03 GET materials trail', trail.status === 200 && (trail.json?.trail ?? []).length >= 1, `events=${trail.json?.trail?.length}`)
  }

  // ---------- P2-04: shift handover ----------
  const shift = await api(FT, 'POST', '/api/operations/shifts/handover', {
    electionSlug, pollingUnitId: puId, shiftName: 'morning', incomingOfficerName: MARK,
    runningSituationLog: `${MARK} handover log`, materialsStatus: 'All sensitive materials accounted for', crowdAssessment: 'calm',
  })
  check('P2-04 POST shift handover', shift.status === 200, `status=${shift.status} ${shift.json?.error ?? ''}`)

  // ---------- P2-05: logistics request ----------
  const logi = await api(FT, 'POST', '/api/operations/logistics', {
    electionSlug, category: 'fuel', priority: 'low', quantityDescription: `${MARK} 5L petrol`, pollingUnitId: puId,
  })
  check('P2-05 POST logistics request', logi.status === 200, `status=${logi.status} ${logi.json?.error ?? ''}`)

  // ---------- M12: vote tally (captures + restores pre-existing rows) ----------
  if (electionSlug) {
    const cands = await api(FT, 'GET', `/api/field/elections/${encodeURIComponent(electionSlug)}/candidate-parties`)
    const parties = cands.json?.parties ?? []
    check('M12 GET candidate-parties', cands.status === 200 && parties.length > 0, `parties=${parties.length}`)
    if (parties.length) {
      const el = await pool.query(`SELECT id FROM elections WHERE slug = $1`, [electionSlug])
      const electionId = el.rows[0]?.id
      const pre = await pool.query(
        `SELECT party_id, votes FROM election_pu_party_votes WHERE election_id = $1 AND polling_unit_id = $2`,
        [electionId, puId])
      restore.votes = { electionId, puId, rows: pre.rows }
      const votes = parties.slice(0, 3).map((p, i) => ({ partyId: p.id, votes: i + 1 }))
      const vt = await api(FT, 'POST', `/api/field/elections/${encodeURIComponent(electionSlug)}/votes`, { votes })
      check('M12 POST vote tally', vt.status === 200 && vt.json?.ok === true, `status=${vt.status} ${vt.json?.error ?? ''}`)
      const dbCheck = await pool.query(
        `SELECT COALESCE(SUM(votes),0)::int AS total FROM election_pu_party_votes WHERE election_id = $1 AND polling_unit_id = $2`,
        [electionId, puId])
      check('M12 tally persisted in DB', dbCheck.rows[0]?.total === 1 + 2 + 3, `total=${dbCheck.rows[0]?.total}`)
    }
  }

  // ---------- M17b: DM to command ----------
  if (CT) {
    const meCmd = await api(CT, 'GET', '/api/auth/me')
    const cmdId = meCmd.json?.user?.id
    if (cmdId) {
      const dm = await api(FT, 'POST', `/api/chat/dm/${encodeURIComponent(cmdId)}`, { content: `${MARK} dm from field` })
      check('M17b POST DM field→command', dm.status === 200 || dm.status === 201, `status=${dm.status} ${dm.json?.error ?? ''}`)
      const hist = await api(FT, 'GET', `/api/chat/dm/${encodeURIComponent(cmdId)}?limit=10`)
      const seen = (hist.json?.messages ?? []).some((m) => (m.content ?? m.body ?? '').includes(MARK))
      check('M17b DM history read-back', hist.status === 200 && seen)
    }
  }

  // ---------- write restore file ----------
  const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '.livetest-restore.json')
  fs.writeFileSync(out, JSON.stringify(restore, null, 2))
  console.log(`\nRestore data written to ${out}`)

  const failed = results.filter((r) => !r.pass)
  console.log(`\n===== ${results.length - failed.length}/${results.length} PASSED =====`)
  if (failed.length) console.log('FAILED:', failed.map((f) => f.name).join(' | '))
}

main().catch((e) => { console.error('TEST SCRIPT ERROR:', e) }).finally(async () => { await pool.end().catch(() => {}) })
