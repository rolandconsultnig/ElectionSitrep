/**
 * Apply database/migration_*.sql files in lexical order (003 → 004 → 005 …).
 * Requires DATABASE_URL in repo-root .env.local or .env (same as the API).
 * If baseline tables are missing, applies database/schema.sql first automatically.
 *
 * With --dry-run, nothing touches the target database: a throwaway database is
 * created, schema.sql plus every migration is applied to it, and it is dropped
 * again. This proves the whole chain still applies to an empty database (CI).
 * A scratch database is used rather than a wrapping transaction because some
 * migrations carry their own BEGIN/COMMIT, which would break an outer rollback.
 */
import fs from 'fs'
import path from 'path'
import pg from 'pg'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '../../.env.local') })
dotenv.config({ path: path.join(__dirname, '../../.env') })

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  console.error('[migrate] DATABASE_URL is not set. Set it in .env.local at the repo root.')
  process.exit(1)
}

const dbDir = path.join(__dirname, '../../database')
const files = fs
  .readdirSync(dbDir)
  .filter((f) => f.startsWith('migration_') && f.endsWith('.sql'))
  .sort()

const dryRun = process.argv.includes('--dry-run')

function readSchemaSql() {
  const schemaPath = path.join(dbDir, 'schema.sql')
  if (!fs.existsSync(schemaPath)) {
    console.error('[migrate] Baseline table app_users missing and database/schema.sql not found.')
    process.exit(1)
  }
  return fs.readFileSync(schemaPath, 'utf8')
}

/** Applies the migration chain through `run`, optionally preceded by the baseline schema. */
async function applyChain(run, { withBaseline }) {
  if (withBaseline) {
    console.log('[migrate] Applying baseline database/schema.sql…')
    await run(readSchemaSql())
    console.log('[migrate] database/schema.sql — ok')
  }
  if (files.length === 0) {
    console.log('[migrate] No migration_*.sql files found.')
    return
  }
  for (const file of files) {
    const sql = fs.readFileSync(path.join(dbDir, file), 'utf8')
    console.log(`[migrate] Applying ${file}…`)
    await run(sql)
    console.log(`[migrate] ${file} — ok`)
  }
}

async function migrate() {
  const pool = new pg.Pool({ connectionString: databaseUrl })
  try {
    const baseline = await pool.query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'app_users'`,
    )
    await applyChain((sql) => pool.query(sql), { withBaseline: baseline.rows.length === 0 })
    console.log('[migrate] Done.')
  } finally {
    await pool.end()
  }
}

async function dryRunMigrate() {
  const scratch = `sitrep_migrate_check_${Date.now()}`
  const target = new URL(databaseUrl)
  const adminUrl = new URL(databaseUrl)
  adminUrl.pathname = '/postgres'

  const admin = new pg.Client({ connectionString: adminUrl.toString() })
  await admin.connect()
  try {
    console.log(`[migrate] Dry run — creating scratch database ${scratch}`)
    await admin.query(`CREATE DATABASE "${scratch}"`)
  } catch (e) {
    await admin.end()
    throw e
  }

  target.pathname = `/${scratch}`
  const scratchClient = new pg.Client({ connectionString: target.toString() })
  let failure = null
  try {
    await scratchClient.connect()
    await applyChain((sql) => scratchClient.query(sql), { withBaseline: true })
  } catch (e) {
    failure = e
  } finally {
    await scratchClient.end().catch(() => {})
    await admin.query(`DROP DATABASE IF EXISTS "${scratch}" WITH (FORCE)`).catch((e) => {
      console.error(`[migrate] Could not drop scratch database ${scratch}:`, e.message)
    })
    await admin.end().catch(() => {})
  }
  if (failure) throw failure
  console.log(`[migrate] Dry run OK — ${files.length} migration(s) apply cleanly to an empty database.`)
}

const main = dryRun ? dryRunMigrate : migrate

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
