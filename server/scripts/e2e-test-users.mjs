/** One-off: create/reset E2E test users (field + management) with a known password. */
import bcrypt from 'bcrypt'
import { pool } from '../src/db.js'

const PASSWORD = 'e2e-test-pass'
const users = [
  ['field.officer1', 'field'],
  ['management.ops', 'management'],
]

const hash = await bcrypt.hash(PASSWORD, 10)
for (const [username, portal] of users) {
  const res = await pool.query(
    `INSERT INTO app_users (username, password_hash, portal, onboarding_complete, password_must_change)
     VALUES ($1, $2, $3, true, false)
     ON CONFLICT (username) DO UPDATE SET
       password_hash = EXCLUDED.password_hash,
       portal = EXCLUDED.portal,
       onboarding_complete = true,
       password_must_change = false,
       updated_at = now()
     RETURNING id, username, portal`,
    [username, hash, portal]
  )
  console.log('upserted:', res.rows[0])
}
await pool.end()
