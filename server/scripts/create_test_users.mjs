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

const COMMON_PASSWORD = 'Admin123@'

const TEST_ACCOUNTS = [
  {
    level: 'Portal 01: Admin / System Infrastructure',
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
    level: 'Portal 04: IGP Executive / National Command',
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
    level: 'Portal 02: Field (Polling Unit Ground Officer)',
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
  // Aliases for user convenience
  {
    level: 'Portal 03: Management (National - Alias)',
    username: 'management.national',
    portal: 'management',
    jurisdiction_level: 'national',
    state_id: null,
    lga_id: null,
    service_number: 'NPF-HQ-ALIAS-01',
    full_name: 'Commissioner of Police (Force HQ Ops)',
    phone: '+2348011110003',
    assigned_pu_id: null,
    notes: 'Alias for mgmt.national',
  },
  {
    level: 'Portal 03: Management (State Level - Alias)',
    username: 'management.state',
    portal: 'management',
    jurisdiction_level: 'state',
    state_id: 1,
    lga_id: null,
    service_number: 'NPF-CP-ALIAS-01',
    full_name: 'CP Lagos State Command',
    phone: '+2348011110004',
    assigned_pu_id: null,
    notes: 'Alias for mgmt.state',
  },
  {
    level: 'Portal 03: Management (Area Command - Alias)',
    username: 'management.area',
    portal: 'management',
    jurisdiction_level: 'area',
    state_id: 1,
    lga_id: 1352,
    service_number: 'NPF-AC-ALIAS-01',
    full_name: 'ACP Area Commander (Ikeja Area Command)',
    phone: '+2348011110005',
    assigned_pu_id: null,
    notes: 'Alias for mgmt.area',
  },
  {
    level: 'Portal 02: Field (PU Officer - Alias)',
    username: 'field.test',
    portal: 'field',
    jurisdiction_level: 'national',
    state_id: 1,
    lga_id: 1352,
    service_number: 'NPF-PU-ALIAS-01',
    full_name: 'Inspector B. Okafor (PU Field Officer)',
    phone: '+2348011110007',
    assigned_pu_id: 3288934,
    notes: 'Alias for field.pu',
  },
  {
    level: 'Portal 02: Field (First-time Login / Liveness Onboarding Test)',
    username: 'onboard.test',
    portal: 'field',
    jurisdiction_level: 'national',
    state_id: 1,
    lga_id: 1352,
    service_number: 'NPF-OB-TEST-01',
    full_name: 'Sergeant T. Onboarding (Pending Liveness)',
    phone: '+2348011110099',
    assigned_pu_id: 3288934,
    notes: 'Test account requiring first-time login onboarding and live photo verification',
    needs_onboarding: true,
  },
]

async function main() {
  console.log('--- Creating Test IDs for Each Level & Portal ---')
  const hash = await bcrypt.hash(COMMON_PASSWORD, 10)

  for (const acc of TEST_ACCOUNTS) {
    let stateId = acc.state_id
    let lgaId = acc.lga_id
    let resolvedPuId = null

    if (acc.state_id) {
      const s = await pool.query(`SELECT id FROM geo_states WHERE id = $1`, [acc.state_id])
      if (s.rows.length) {
        stateId = s.rows[0].id
      } else {
        const anyS = await pool.query(`SELECT id FROM geo_states ORDER BY id LIMIT 1`)
        stateId = anyS.rows[0]?.id ?? null
      }
    }

    if (acc.lga_id) {
      const l = await pool.query(`SELECT id FROM geo_lgas WHERE id = $1`, [acc.lga_id])
      if (l.rows.length) {
        lgaId = l.rows[0].id
      } else if (stateId) {
        const anyL = await pool.query(`SELECT id FROM geo_lgas WHERE state_id = $1 ORDER BY id LIMIT 1`, [stateId])
        lgaId = anyL.rows[0]?.id ?? null
      }
    }

    if (acc.portal === 'field' && !acc.service_number.includes('DPO')) {
      if (lgaId) {
        const pu = await pool.query(
          `SELECT gp.id FROM geo_polling_units gp
           JOIN geo_wards gw ON gw.id = gp.ward_id
           WHERE gw.lga_id = $1 ORDER BY gp.id LIMIT 1`,
          [lgaId]
        )
        resolvedPuId = pu.rows[0]?.id ?? null
      }
      if (!resolvedPuId) {
        const anyPu = await pool.query(`SELECT id FROM geo_polling_units ORDER BY id LIMIT 1`)
        resolvedPuId = anyPu.rows[0]?.id ?? null
      }
    }

    const obComplete = !acc.needs_onboarding
    const pwdMustChange = !!acc.needs_onboarding
    const liveVerified = !acc.needs_onboarding

    // 1. Upsert app_users
    const userRes = await pool.query(
      `INSERT INTO app_users (
         username, password_hash, portal, onboarding_complete, password_must_change,
         jurisdiction_level, jurisdiction_state_id, jurisdiction_lga_id
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (username) DO UPDATE SET
         password_hash = EXCLUDED.password_hash,
         portal = EXCLUDED.portal,
         onboarding_complete = EXCLUDED.onboarding_complete,
         password_must_change = EXCLUDED.password_must_change,
         jurisdiction_level = EXCLUDED.jurisdiction_level,
         jurisdiction_state_id = EXCLUDED.jurisdiction_state_id,
         jurisdiction_lga_id = EXCLUDED.jurisdiction_lga_id,
         updated_at = now()
       RETURNING id, username, portal, jurisdiction_level`,
      [
        acc.username,
        hash,
        acc.portal,
        obComplete,
        pwdMustChange,
        acc.jurisdiction_level,
        stateId,
        lgaId,
      ]
    )

    const user = userRes.rows[0]

    // 2. Upsert officer_profiles
    await pool.query(
      `INSERT INTO officer_profiles (
         user_id, full_name, service_number, phone,
         assigned_polling_unit_id, liveness_verified, liveness_checked_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, ${liveVerified ? 'now()' : 'NULL'})
       ON CONFLICT (user_id) DO UPDATE SET
         full_name = EXCLUDED.full_name,
         service_number = EXCLUDED.service_number,
         phone = EXCLUDED.phone,
         assigned_polling_unit_id = EXCLUDED.assigned_polling_unit_id,
         liveness_verified = EXCLUDED.liveness_verified,
         liveness_checked_at = EXCLUDED.liveness_checked_at,
         picture_data = CASE WHEN $6 = false THEN NULL ELSE officer_profiles.picture_data END,
         picture_content_type = CASE WHEN $6 = false THEN NULL ELSE officer_profiles.picture_content_type END,
         updated_at = now()`,
      [
        user.id,
        acc.full_name,
        acc.service_number,
        acc.phone,
        resolvedPuId,
        liveVerified,
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
