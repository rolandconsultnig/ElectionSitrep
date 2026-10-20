/**
 * Cleanup for live-mutation-test.mjs.
 * Deletes every LIVETEST-marked row and restores pre-existing rows that the
 * test overwrote (EC8A evidence upsert, milestone upsert, vote tally replace).
 * Safe to run repeatedly.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pool } from '../server/src/db.js'

const MARK = 'LIVETEST'
const restorePath = path.join(path.dirname(fileURLToPath(import.meta.url)), '.livetest-restore.json')
const restore = fs.existsSync(restorePath) ? JSON.parse(fs.readFileSync(restorePath, 'utf8')) : {}

async function q(label, sql, params) {
  const r = await pool.query(sql, params)
  console.log(`${label}: ${r.rowCount ?? 0} row(s)`)
  return r
}

async function main() {
  await pool.query('BEGIN')
  try {
    // incidents (incident_events cascade via FK ON DELETE CASCADE)
    await q('incident_events (test incidents)', `
      DELETE FROM incident_events WHERE incident_id IN (SELECT id FROM incidents WHERE description ILIKE $1 OR title ILIKE $1)`,
      [`%${MARK}%`])
    await q('incidents', `DELETE FROM incidents WHERE description ILIKE $1 OR title ILIKE $1`, [`%${MARK}%`])

    // field capture outbox (sitreps / violence / raw incident copies)
    await q('field_capture_outbox', `DELETE FROM field_capture_outbox WHERE client_id LIKE 'livetest-%'`)

    // sos
    await q('sos_locations', `
      DELETE FROM sos_locations WHERE sos_id IN (
        SELECT id FROM sos_alerts WHERE note ILIKE $1 OR started_at > now() - interval '2 hours'
          AND user_id IN (SELECT id FROM app_users WHERE username = 'field.officer1'))`, [`%${MARK}%`])
    await q('sos_alerts', `DELETE FROM sos_alerts WHERE note ILIKE $1`, [`%${MARK}%`])
    // fallback: any sos alert created by the test user during the test window
    await q('sos_alerts (recent test-user fallback)', `
      DELETE FROM sos_alerts WHERE user_id IN (SELECT id FROM app_users WHERE username = 'field.officer1')
        AND started_at > now() - interval '2 hours'`)

    // officer safety state — reset the demo officer's check-in state
    await q('officer_safety reset', `
      UPDATE officer_safety SET last_ok_at = NULL, next_due_at = NULL, missed_flagged_at = NULL,
        battery_pct = NULL, network = NULL, telemetry_at = NULL
      WHERE user_id IN (SELECT id FROM app_users WHERE username = 'field.officer1')`)

    // sensitive materials
    await q('sensitive_materials_audit_trail', `
      DELETE FROM sensitive_materials_audit_trail WHERE material_id IN (
        SELECT id FROM sensitive_materials_custody WHERE serial_or_barcode LIKE $1)`, [`${MARK}-%`])
    await q('sensitive_materials_custody', `DELETE FROM sensitive_materials_custody WHERE serial_or_barcode LIKE $1`, [`${MARK}-%`])

    // shift handovers + logistics
    await q('shift_handovers', `DELETE FROM shift_handovers WHERE running_situation_log ILIKE $1 OR incoming_officer_name = $2`, [`%${MARK}%`, MARK])
    await q('logistics_requests', `DELETE FROM logistics_requests WHERE quantity_description ILIKE $1`, [`%${MARK}%`])

    // chat messages
    await q('chat_messages', `DELETE FROM chat_messages WHERE content ILIKE $1`, [`%${MARK}%`])

    // timeline milestone: delete if test-created, restore if it overwrote one
    if (restore.milestone) {
      const m = restore.milestone
      await pool.query(
        `INSERT INTO pu_operational_milestones (election_id, polling_unit_id, milestone, recorded_by, timestamp, notes, metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (election_id, polling_unit_id, milestone) DO UPDATE SET
           timestamp = EXCLUDED.timestamp, notes = EXCLUDED.notes, metadata = EXCLUDED.metadata, recorded_by = EXCLUDED.recorded_by`,
        [m.election_id, m.polling_unit_id, m.milestone, m.recorded_by, m.timestamp, m.notes, m.metadata])
      console.log('pu_operational_milestones: restored pre-existing row')
    } else {
      await q('pu_operational_milestones', `DELETE FROM pu_operational_milestones WHERE notes ILIKE $1`, [`%${MARK}%`])
    }

    // ec8a evidence: delete test row, restore overwritten one
    await q('ec8a_results_evidence (test row)', `DELETE FROM ec8a_results_evidence WHERE photo_hash_sha256 LIKE 'LIVETESTHASH%'`)
    if (restore.ec8a) {
      const e = restore.ec8a
      const cols = Object.keys(e).filter((k) => k !== 'id' && k !== 'created_at' && k !== 'updated_at')
      await pool.query(
        `INSERT INTO ec8a_results_evidence (${cols.join(',')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(',')})
         ON CONFLICT (election_id, polling_unit_id, photo_source) DO NOTHING`,
        cols.map((c) => e[c]))
      console.log('ec8a_results_evidence: restored pre-existing row')
    }

    // vote tally: replace semantics — restore captured rows
    if (restore.votes) {
      const v = restore.votes
      await pool.query(`DELETE FROM election_pu_party_votes WHERE election_id = $1 AND polling_unit_id = $2`, [v.electionId, v.puId])
      for (const row of v.rows) {
        await pool.query(
          `INSERT INTO election_pu_party_votes (election_id, polling_unit_id, party_id, votes, uploaded_at, updated_at)
           VALUES ($1,$2,$3,$4, now(), now())`, [v.electionId, v.puId, row.party_id, row.votes])
      }
      console.log(`election_pu_party_votes: restored ${v.rows.length} pre-existing row(s)`)
    }

    await pool.query('COMMIT')
    console.log('\nCleanup committed.')

    // verification sweep — must all be zero
    const checks = await pool.query(`
      SELECT
        (SELECT count(*) FROM incidents WHERE description ILIKE '%LIVETEST%' OR title ILIKE '%LIVETEST%') AS incidents,
        (SELECT count(*) FROM field_capture_outbox WHERE client_id LIKE 'livetest-%') AS outbox,
        (SELECT count(*) FROM sos_alerts WHERE note ILIKE '%LIVETEST%') AS sos,
        (SELECT count(*) FROM sensitive_materials_custody WHERE serial_or_barcode LIKE 'LIVETEST-%') AS materials,
        (SELECT count(*) FROM shift_handovers WHERE running_situation_log ILIKE '%LIVETEST%') AS shifts,
        (SELECT count(*) FROM logistics_requests WHERE quantity_description ILIKE '%LIVETEST%') AS logistics,
        (SELECT count(*) FROM chat_messages WHERE content ILIKE '%LIVETEST%') AS chat,
        (SELECT count(*) FROM ec8a_results_evidence WHERE photo_hash_sha256 LIKE 'LIVETESTHASH%') AS ec8a,
        (SELECT count(*) FROM pu_operational_milestones WHERE notes ILIKE '%LIVETEST%') AS milestones`)
    console.log('Leftover LIVETEST rows (all must be 0):', checks.rows[0])
  } catch (e) {
    await pool.query('ROLLBACK')
    throw e
  }
}

main().catch((e) => { console.error('CLEANUP ERROR:', e); process.exitCode = 1 }).finally(async () => { await pool.end().catch(() => {}) })
