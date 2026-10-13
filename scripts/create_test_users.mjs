import bcrypt from 'bcrypt'
import pg from 'pg'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '../.env.local') })
dotenv.config({ path: path.join(__dirname, '../.env') })

const dbUrl = process.env.DATABASE_URL
if (!dbUrl) {
  console.error('DATABASE_URL not set in .env.local')
  process.exit(1)
}

const pool = new pg.Pool({ connectionString: dbUrl })

const COMMON_PASSWORD = 'Admin123@'

const TEST_ACCOUNTS = [
  {
    level: 'Portal 01: Admin / Infrastructure',
    username: 'admin.test',
    portal: 'admin',
    jurisdiction_level: 'national',
    state_id: null,
    lga_id: null,
    service_number: 'NPF-ADM-TEST-01',
    full_name: 'Superintendent K. Danladi (System Admin)',
    phone: '+2348011110001',
    assigned_pu_id: null,
    notes: 'Full administrative access: election setup, config, user management, audit logs',
  },
  {
    level: 'Portal 04: IGP Executive / National',
    username: 'igp.test',
    portal: 'igp',
    jurisdiction_level: 'national',
    state_id: null,
    lga_id: null,
    service_number: 'NPF-IGP-TEST-01',
    full_name: 'IGP Staff Officer (Executive Command)',
    phone: '+2348011110002',
    assigned_pu_id: null,
    notes: 'National executive oversight, strategic briefing, national security posture',
  },
  {
    level: 'Portal 03: Management (National / Force HQ)',
    username: 'mgmt.national',
    portal: 'management',
    jurisdiction_level: 'national',
    state_id: null,
    lga_id: null,
    service_number: 'NPF-HQ-TEST-01',
    full_name: 'Commissioner of Police (Force HQ Ops)',
    phone: '+2348011110003',
    assigned_pu_id: null,
    notes: 'Nationwide management situation room, all 36 states + FCT',
  },
  {
    level: 'Portal 03: Management (State Level - Lagos)',
    username: 'mgmt.state',
    portal: 'management',
    jurisdiction_level: 'state',
    state_id: 1, // Lagos
    lga_id: null,
    service_number: 'NPF-CP-TEST-01',
    full_name: 'CP Lagos State Command',
    phone: '+2348011110004',
    assigned_pu_id: null,
    notes: 'State-scoped situation room; strictly sees and manages Lagos State',
  },
  {
    level: 'Portal 03: Management (Area Command Level - Ikeja)',
    username: 'mgmt.area',
    portal: 'management',
    jurisdiction_level: 'area',
    state_id: 1, // Lagos
    lga_id: 1352, // Ikeja
    service_number: 'NPF-AC-TEST-01',
    full_name: 'ACP Area Commander (Ikeja Area Command)',
    phone: '+2348011110005',
    assigned_pu_id: null,
    notes: 'Area-command scoped view; strictly sees Ikeja LGA',
  },
  {
    level: 'Portal 02: Field (Divisional / DPO Level)',
    username: 'field.dpo',
    portal: 'field',
    jurisdiction_level: 'area',
    state_id: 1, // Lagos
    lga_id: 1352, // Ikeja
    service_number: 'NPF-DPO-TEST-01',
    full_name: 'CSP Divisional Police Officer (Ikeja Division)',
    phone: '+2348011110006',
    assigned_pu_id: null,
    notes: 'Divisional field officer; escalation and station sitrep reporting',
  },
  {
    level: 'Portal 02: Field (Polling Unit / Ground Level)',
    username: 'field.pu',
    portal: 'field',
    jurisdiction_level: 'national',
    state_id: 1,
    lga_id: 1352,
    service_number: 'NPF-PU-TEST-01',
    full_name: 'Inspector B. Okafor (PU Field Officer)',
    phone: '+2348011110007',
    assigned_pu_id: 3288934, // LA-011-W01-017 in Ikeja
    notes: 'Ground polling unit officer; EC8A tally, live SitReps, turnout, and incidents',
  },
]

async function main() {
  console.log('--- Creating Test IDs for Each Level & Portal ---')
  const hash = await bcrypt.hash(COMMON_PASSWORD, 10)

  for (const acc of TEST_ACCOUNTS) {
    // 1. Upsert app_users
    const userRes = await pool.query(
      `INSERT INTO app_users (
         username, password_hash, portal, onboarding_complete, password_must_change,
         jurisdiction_level, jurisdiction_state_id, jurisdiction_lga_id
       )
       VALUES ($1, $2, $3, true, false, $4, $5, $6)
       ON CONFLICT (username) DO UPDATE SET
         password_hash = EXCLUDED.password_hash,
         portal = EXCLUDED.portal,
         onboarding_complete = true,
         password_must_change = false,
         jurisdiction_level = EXCLUDED.jurisdiction_level,
         jurisdiction_state_id = EXCLUDED.jurisdiction_state_id,
         jurisdiction_lga_id = EXCLUDED.jurisdiction_lga_id,
         updated_at = now()
       RETURNING id, username, portal, jurisdiction_level`,
      [
        acc.username,
        hash,
        acc.portal,
        acc.jurisdiction_level,
        acc.state_id,
        acc.lga_id,
      ]
    )

    const user = userRes.rows[0]

    // 2. Upsert officer_profiles
    await pool.query(
      `INSERT INTO officer_profiles (
         user_id, full_name, service_number, phone,
         assigned_polling_unit_id, liveness_verified, liveness_checked_at
       )
       VALUES ($1, $2, $3, $4, $5, true, now())
       ON CONFLICT (user_id) DO UPDATE SET
         full_name = EXCLUDED.full_name,
         service_number = EXCLUDED.service_number,
         phone = EXCLUDED.phone,
         assigned_polling_unit_id = EXCLUDED.assigned_polling_unit_id,
         liveness_verified = true,
         updated_at = now()`,
      [
        user.id,
        acc.full_name,
        acc.service_number,
        acc.phone,
        acc.assigned_pu_id,
      ]
    )

    console.log(`✓ [${acc.level}] ${acc.username} (${acc.service_number}) -> Ready`)
  }

  console.log('\nAll test accounts successfully created/updated with password: ' + COMMON_PASSWORD)
  await pool.end()
}

main().catch((err) => {
  console.error('Error seeding test accounts:', err)
  process.exit(1)
})
