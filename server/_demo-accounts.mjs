import { pool } from './src/db.js'
import bcrypt from 'bcrypt'

// [username, password, portal, onboarded, assignedPuCode, displayName, serviceNumber]
const ACCOUNTS = [
  ['officer1', '1357', 'field', false, 'EK-001-W01-002', 'Field Officer One', 'NPF-FO-OFF1-01'],
  ['officer2', '1357', 'field', false, 'EK-001-W01-003', 'Field Officer Two', 'NPF-FO-OFF2-01'],
  ['officer3', '1357', 'field', false, 'EK-001-W01-004', 'Field Officer Three', 'NPF-FO-OFF3-01'],
  ['officer4', '1357', 'field', false, 'EK-001-W01-005', 'Field Officer Four', 'NPF-FO-OFF4-01'],
  ['supertest', '1357', 'field', true, 'EK-001-W01-006', 'Super Test Officer', 'NPF-FO-TEST-01'],
  ['adminman', 'admin', 'admin', true, null, null, null],
  ['igpdemo1', '1357', 'igp', true, null, null, null],
]

for (const [username, password, portal, onboarded, puCode, name, svc] of ACCOUNTS) {
  const hash = await bcrypt.hash(password, 10)
  const existing = await pool.query(`SELECT id FROM app_users WHERE username = $1`, [username])
  let userId
  if (existing.rows.length) {
    userId = existing.rows[0].id
    await pool.query(
      `UPDATE app_users SET password_hash = $1, portal = $2, onboarding_complete = $3,
       password_must_change = $4, updated_at = now() WHERE id = $5`,
      [hash, portal, onboarded, !onboarded, userId],
    )
    console.log(`~ ${username} updated`)
  } else {
    const u = await pool.query(
      `INSERT INTO app_users (username, password_hash, portal, onboarding_complete, password_must_change)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [username, hash, portal, onboarded, !onboarded],
    )
    userId = u.rows[0].id
    console.log(`+ ${username} created`)
  }

  if (portal === 'field') {
    let puId = null
    if (puCode) {
      const pu = await pool.query(`SELECT id FROM geo_polling_units WHERE code = $1`, [puCode])
      puId = pu.rows[0]?.id ?? null
      if (!puId) console.warn(`  ! PU ${puCode} not found — officer left unassigned`)
    }
    await pool.query(
      `INSERT INTO officer_profiles (user_id, full_name, service_number, phone, liveness_verified, liveness_checked_at, assigned_polling_unit_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id) DO UPDATE SET
         liveness_verified = EXCLUDED.liveness_verified,
         liveness_checked_at = EXCLUDED.liveness_checked_at,
         assigned_polling_unit_id = EXCLUDED.assigned_polling_unit_id,
         updated_at = now()`,
      [userId, name, svc, '08000000000', onboarded, onboarded ? new Date() : null, puId],
    )
    console.log(`  profile ok (liveness=${onboarded}, pu=${puCode ?? 'none'})`)
  }
}
await pool.end()
console.log('done')
