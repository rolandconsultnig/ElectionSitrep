/**
 * Apply database/migration_*.sql files in lexical order (003 → 004 → 005 …).
 * Requires DATABASE_URL in repo-root .env.local or .env (same as the API).
 * If baseline tables are missing, applies database/schema.sql first automatically.
 *
 * Every applied file is recorded in the schema_migrations ledger and is never
 * re-applied. This matters: several early migrations are destructive when
 * replayed (migration_012 and _013 do an unconditional DELETE FROM
 * geo_polling_units, which cascades into election_pu_party_votes and wipes
 * uploaded tallies). Re-running the chain used to be data loss.
 *
 * Flags:
 *   --dry-run                Create a throwaway database, apply schema.sql plus
 *                            every migration to it, then drop it. The target
 *                            database is never touched. Used by CI. A scratch
 *                            database is used rather than a wrapping transaction
 *                            because some migrations carry their own
 *                            BEGIN/COMMIT, which would break an outer rollback.
 *   --baseline-through=FILE   Record FILE and everything before it as applied
 *                            WITHOUT running it. Use once on a database that
 *                            predates the ledger, naming the last migration
 *                            already applied there.
 *   --list                    Show which migrations are applied vs pending.
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
const listOnly = process.argv.includes('--list')
const baselineArg = process.argv.find((a) => a.startsWith('--baseline-through='))

function readSchemaSql() {
  const schemaPath = path.join(dbDir, 'schema.sql')
  if (!fs.existsSync(schemaPath)) {
    console.error('[migrate] Baseline table app_users missing and database/schema.sql not found.')
    process.exit(1)
  }
  return fs.readFileSync(schemaPath, 'utf8')
}

async function ensureLedger(run) {
  await run(`CREATE TABLE IF NOT EXISTS schema_migrations (
    filename TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`)
}

async function appliedFiles(run) {
  const { rows } = await run(`SELECT filename FROM schema_migrations`)
  return new Set(rows.map((r) => r.filename))
}

/** Applies the pending migration chain through `run`, optionally preceded by the baseline schema. */
async function applyChain(run, { withBaseline }) {
  if (withBaseline) {
    console.log('[migrate] Applying baseline database/schema.sql…')
    await run(readSchemaSql())
    console.log('[migrate] database/schema.sql — ok')
  }
  await ensureLedger(run)
  if (files.length === 0) {
    console.log('[migrate] No migration_*.sql files found.')
    return
  }
  const applied = await appliedFiles(run)
  const pending = files.filter((f) => !applied.has(f))
  if (applied.size) console.log(`[migrate] ${applied.size} migration(s) already applied — skipping.`)
  if (pending.length === 0) {
    console.log('[migrate] Nothing to do, database is up to date.')
    return
  }
  for (const file of pending) {
    const sql = fs.readFileSync(path.join(dbDir, file), 'utf8')
    console.log(`[migrate] Applying ${file}…`)
    await run(sql)
    await run(`INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING`, [file])
    console.log(`[migrate] ${file} — ok`)
  }
}

async function migrate() {
  const pool = new pg.Pool({ connectionString: databaseUrl })
  const run = (sql, params) => pool.query(sql, params)
  try {
    const existing = await pool.query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'app_users'`,
    )
    const isFresh = existing.rows.length === 0

    // A populated database with no ledger predates migration tracking. Replaying
    // the chain there would delete polling units and cascade away uploaded
    // tallies, so refuse and ask for an explicit baseline instead.
    if (!isFresh) {
      await ensureLedger(run)
      const applied = await appliedFiles(run)
      if (applied.size === 0) {
        console.error(
          '[migrate] This database has data but no schema_migrations entries.\n' +
            '[migrate] Replaying the full chain would DELETE polling units and cascade\n' +
            '[migrate] away uploaded vote tallies. Record what is already applied first:\n' +
            '[migrate]\n' +
            `[migrate]   node scripts/migrate.js --baseline-through=${files[files.length - 2] ?? files[0]}\n` +
            '[migrate]\n' +
            '[migrate] naming the last migration already applied here, then re-run migrate.',
        )
        process.exit(1)
      }
    }

    await applyChain(run, { withBaseline: isFresh })
    console.log('[migrate] Done.')
  } finally {
    await pool.end()
  }
}

/** Records `target` and everything lexically before it as applied, without running them. */
async function baselineThrough(target) {
  if (!files.includes(target)) {
    console.error(`[migrate] Unknown migration: ${target}`)
    console.error('[migrate] Known migrations:')
    for (const f of files) console.error(`[migrate]   ${f}`)
    process.exit(1)
  }
  const pool = new pg.Pool({ connectionString: databaseUrl })
  const run = (sql, params) => pool.query(sql, params)
  try {
    await ensureLedger(run)
    const upTo = files.slice(0, files.indexOf(target) + 1)
    for (const file of upTo) {
      await run(`INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING`, [file])
    }
    console.log(`[migrate] Baselined ${upTo.length} migration(s) as applied, through ${target}.`)
    const pending = files.slice(files.indexOf(target) + 1)
    console.log(
      pending.length
        ? `[migrate] Pending: ${pending.join(', ')}`
        : '[migrate] No pending migrations.',
    )
  } finally {
    await pool.end()
  }
}

async function listMigrations() {
  const pool = new pg.Pool({ connectionString: databaseUrl })
  const run = (sql, params) => pool.query(sql, params)
  try {
    await ensureLedger(run)
    const applied = await appliedFiles(run)
    for (const f of files) console.log(`${applied.has(f) ? '  applied' : '  PENDING'}  ${f}`)
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
    await applyChain((sql, params) => scratchClient.query(sql, params), { withBaseline: true })
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

const main = dryRun
  ? dryRunMigrate
  : listOnly
    ? listMigrations
    : baselineArg
      ? () => baselineThrough(baselineArg.split('=')[1])
      : migrate

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
