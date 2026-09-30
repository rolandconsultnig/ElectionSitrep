import bcrypt from 'bcrypt'
import pg from 'pg'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '../../.env.local') })
dotenv.config({ path: path.join(__dirname, '../../.env') })

const dbUrl = process.env.DATABASE_URL
if (!dbUrl) {
  console.error('DATABASE_URL not set in .env.local')
  process.exit(1)
}

const pool = new pg.Pool({ connectionString: dbUrl })

async function run() {
  const username = 'agent1'
  const plainPassword = 'agent123@'
  const portal = 'field'
  const hash = await bcrypt.hash(plainPassword, 10)

  console.log(`Hashing password for user: ${username}...`)

  const userRes = await pool.query(
    `INSERT INTO app_users (username, password_hash, portal, onboarding_complete, password_must_change)
     VALUES ($1, $2, $3, true, false)
     ON CONFLICT (username) DO UPDATE SET
       password_hash = EXCLUDED.password_hash,
       portal = EXCLUDED.portal,
       onboarding_complete = true,
       password_must_change = false,
       updated_at = now()
     RETURNING id, username, portal, onboarding_complete, password_must_change`,
    [username, hash, portal]
  )

  const user = userRes.rows[0]
  console.log(`User created/updated:`, user)

  // Ensure officer profile exists
  await pool.query(
    `INSERT INTO officer_profiles (user_id, full_name, service_number, phone, liveness_verified, liveness_checked_at)
     VALUES ($1, 'Field Officer Agent 1', 'NPF/FLD/2026/001', '+2348000000001', true, now())
     ON CONFLICT (user_id) DO UPDATE SET
       full_name = EXCLUDED.full_name,
       service_number = EXCLUDED.service_number,
       phone = EXCLUDED.phone,
       liveness_verified = true,
       updated_at = now()`,
    [user.id]
  )

  console.log(`Officer profile for ${username} configured successfully!`)
  await pool.end()
}

run().catch((e) => {
  console.error('Error creating user:', e)
  process.exit(1)
})
