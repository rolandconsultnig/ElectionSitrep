/**
 * Focused M12 vote-tally mutation test.
 * Temporarily configures 3 party candidates on the Ekiti test election,
 * submits a PU tally through the real API, verifies DB persistence,
 * restores any pre-existing votes, and removes the temp candidates.
 * Requires the API running on localhost:5530 and the election active.
 */
import { pool } from '../server/src/db.js'

const BASE = 'http://localhost:5530'
const SLUG = 'ekiti-gubernatorial-election'

async function api(token, method, p, body) {
  const res = await fetch(`${BASE}${p}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  let json = null
  try { json = await res.json() } catch { /* empty */ }
  return { status: res.status, json }
}

async function main() {
  const field = await api(null, 'POST', '/api/auth/login', { username: 'field.officer1', password: 'demo' })
  const FT = field.json.token

  const ctx = await api(FT, 'GET', '/api/field/context')
  const puId = ctx.json.assignment.pollingUnit.id

  const el = await pool.query(`SELECT id FROM elections WHERE slug = $1`, [SLUG])
  const electionId = el.rows[0].id

  // temp candidates: first 3 parties
  const parties = await pool.query(`SELECT id, abbreviation FROM political_parties ORDER BY abbreviation LIMIT 3`)
  for (const p of parties.rows) {
    await pool.query(
      `INSERT INTO election_party_candidates (election_id, party_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [electionId, p.id])
  }
  console.log(`[temp candidates configured: ${parties.rows.map((p) => p.abbreviation).join(', ')}]`)

  try {
    const cands = await api(FT, 'GET', `/api/field/elections/${encodeURIComponent(SLUG)}/candidate-parties`)
    const list = cands.json?.parties ?? []
    console.log(`${list.length > 0 ? 'PASS' : 'FAIL'}  M12 GET candidate-parties — parties=${list.length}`)

    const pre = await pool.query(
      `SELECT party_id, votes FROM election_pu_party_votes WHERE election_id = $1 AND polling_unit_id = $2`,
      [electionId, puId])

    const votes = list.slice(0, 3).map((p, i) => ({ partyId: p.id, votes: (i + 1) * 7 }))
    const vt = await api(FT, 'POST', `/api/field/elections/${encodeURIComponent(SLUG)}/votes`, { votes })
    console.log(`${vt.status === 200 && vt.json?.ok ? 'PASS' : 'FAIL'}  M12 POST vote tally — status=${vt.status} ${vt.json?.error ?? ''}`)

    const db = await pool.query(
      `SELECT party_id::text, votes FROM election_pu_party_votes WHERE election_id = $1 AND polling_unit_id = $2 ORDER BY party_id`,
      [electionId, puId])
    const expected = votes.reduce((s, v) => s + v.votes, 0)
    const actual = db.rows.reduce((s, r) => s + r.votes, 0)
    console.log(`${actual === expected ? 'PASS' : 'FAIL'}  M12 tally persisted — expected=${expected} actual=${actual} rows=${db.rows.length}`)

    // validation: unknown party must be rejected
    const bad = await api(FT, 'POST', `/api/field/elections/${encodeURIComponent(SLUG)}/votes`, {
      votes: [{ partyId: '00000000-0000-0000-0000-000000000000', votes: 5 }],
    })
    console.log(`${bad.status === 400 ? 'PASS' : 'FAIL'}  M12 rejects non-candidate party — status=${bad.status}`)

    // restore pre-existing votes
    await pool.query(`DELETE FROM election_pu_party_votes WHERE election_id = $1 AND polling_unit_id = $2`, [electionId, puId])
    for (const r of pre.rows) {
      await pool.query(
        `INSERT INTO election_pu_party_votes (election_id, polling_unit_id, party_id, votes, uploaded_at, updated_at) VALUES ($1,$2,$3,$4,now(),now())`,
        [electionId, puId, r.party_id, r.votes])
    }
    console.log(`[votes restored: ${pre.rows.length} pre-existing row(s)]`)
  } finally {
    await pool.query(`DELETE FROM election_party_candidates WHERE election_id = $1`, [electionId])
    console.log('[temp candidates removed]')
  }
}

main().catch((e) => { console.error('M12 TEST ERROR:', e); process.exitCode = 1 }).finally(async () => { await pool.end().catch(() => {}) })
