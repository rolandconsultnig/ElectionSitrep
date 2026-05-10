/**
 * Seeds parties (INEC annex JSON + PDF logos), presidential candidates, demo users, sample audit rows.
 * Requires DATABASE_URL in ../../.env.local
 * Run: npm run seed (from server/)
 *
 * Build party list + logos first: python ../scripts/build_parties_annex.py
 */
import bcrypt from 'bcrypt'
import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import pg from 'pg'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '../../.env.local') })
dotenv.config({ path: path.join(__dirname, '../../.env') })

const ROOT = path.join(__dirname, '../..')
const ANNEX_JSON = path.join(ROOT, 'database/parties_annex.json')
const LOGO_DIR = path.join(ROOT, 'database/extracted_logos')

const demoUsers = [
  ['admin.demo', 'admin'],
  ['field.officer1', 'field'],
  ['management.ops', 'management'],
  ['igp.office', 'igp'],
]

async function main() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    console.error('DATABASE_URL missing. Set it in .env.local at repo root.')
    process.exit(1)
  }

  if (!fs.existsSync(ANNEX_JSON)) {
    console.error(`Missing ${ANNEX_JSON}. Run: python scripts/build_parties_annex.py`)
    process.exit(1)
  }

  const annex = JSON.parse(fs.readFileSync(ANNEX_JSON, 'utf8'))
  if (!Array.isArray(annex) || annex.length !== 91) {
    console.error('parties_annex.json must contain 91 party rows.')
    process.exit(1)
  }

  const pool = new pg.Pool({ connectionString })
  const demoHash = await bcrypt.hash('demo', 10)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    await client.query('DELETE FROM election_candidates')
    await client.query('DELETE FROM political_parties')

    let logosApplied = 0
    for (const row of annex) {
      const sn = row.annexSn
      const logoPath = path.join(LOGO_DIR, `${String(sn).padStart(3, '0')}.png`)
      let buf = null
      let mime = null
      if (fs.existsSync(logoPath)) {
        buf = fs.readFileSync(logoPath)
        mime = 'image/png'
        logosApplied += 1
      }

      await client.query(
        `INSERT INTO political_parties (
           inec_register_code, name, abbreviation, status,
           annex_sn, presidential_candidate, logo_image, logo_mime, logo_url
         ) VALUES ($1, $2, $3, 'active', $4, $5, $6, $7, NULL)`,
        [
          row.inecRegisterCode,
          row.name,
          row.abbreviation,
          sn,
          row.presidentialCandidate ?? null,
          buf,
          mime,
        ],
      )
    }
    console.log(`Seeded ${annex.length} political parties (${logosApplied} logos from ${LOGO_DIR}).`)

    const pres = await client.query(`SELECT id FROM elections WHERE slug = '2026-presidential'`)
    if (pres.rows.length) {
      const electionId = pres.rows[0].id
      let candCount = 0
      for (const row of annex) {
        if (!row.presidentialCandidate) continue
        const p = await client.query(`SELECT id FROM political_parties WHERE inec_register_code = $1`, [
          row.inecRegisterCode,
        ])
        if (!p.rows.length) continue
        await client.query(
          `INSERT INTO election_candidates (election_id, party_id, candidate_name, nomination_status)
           VALUES ($1, $2, $3, 'confirmed')`,
          [electionId, p.rows[0].id, row.presidentialCandidate],
        )
        candCount += 1
      }
      console.log(`Linked ${candCount} presidential candidates to 2026 Presidential election.`)
    }

    for (const [username, portal] of demoUsers) {
      await client.query(
        `INSERT INTO app_users (username, password_hash, portal, onboarding_complete, password_must_change)
         VALUES ($1, $2, $3, false, true)
         ON CONFLICT (username) DO UPDATE SET
           password_hash = EXCLUDED.password_hash,
           portal = EXCLUDED.portal,
           password_must_change = true,
           updated_at = now()`,
        [username, demoHash, portal],
      )
    }
    console.log(`Demo users upserted (login password: demo): ${demoUsers.map((u) => u[0]).join(', ')}`)

    const ac = await client.query(`SELECT COUNT(*)::int AS c FROM audit_log`)
    if (ac.rows[0].c === 0) {
      await client.query(
        `INSERT INTO audit_log (entity_type, entity_id, action, payload)
         VALUES
           ('state', 'Lagos', 'ORDER_ISSUED', '{"channel":"ops_desk"}'::jsonb),
           ('polling_unit', 'PU-LA-00842', 'SUBMIT_EC8A', '{"verified":true}'::jsonb)`,
      )
      console.log('Inserted sample audit_log rows.')
    }

    await client.query('COMMIT')
    console.log('Seed completed.')
  } catch (e) {
    await client.query('ROLLBACK')
    console.error(e)
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

main()
