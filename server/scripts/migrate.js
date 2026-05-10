/**
 * Apply database/migration_*.sql files in lexical order (003 → 004 → 005 …).
 * Requires DATABASE_URL in repo-root .env.local or .env (same as the API).
 * If baseline tables are missing, applies database/schema.sql first automatically.
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

async function main() {
  const pool = new pg.Pool({ connectionString: databaseUrl })
  try {
    const baseline = await pool.query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'app_users'`,
    )
    if (baseline.rows.length === 0) {
      const schemaPath = path.join(dbDir, 'schema.sql')
      if (!fs.existsSync(schemaPath)) {
        console.error('[migrate] Baseline table app_users missing and database/schema.sql not found.')
        process.exit(1)
      }
      const schemaSql = fs.readFileSync(schemaPath, 'utf8')
      console.log('[migrate] Applying baseline database/schema.sql…')
      await pool.query(schemaSql)
      console.log('[migrate] database/schema.sql — ok')
    }
    if (files.length === 0) {
      console.log('[migrate] No migration_*.sql files found.')
      return
    }
    for (const file of files) {
      const sql = fs.readFileSync(path.join(dbDir, file), 'utf8')
      console.log(`[migrate] Applying ${file}…`)
      await pool.query(sql)
      console.log(`[migrate] ${file} — ok`)
    }
    console.log('[migrate] Done.')
  } finally {
    await pool.end()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
