/**
 * Apply database/migration_*.sql files in lexical order (003 → 004 → 005 …).
 * Requires DATABASE_URL in repo-root .env.local or .env (same as the API).
 * Baseline schema: apply database/schema.sql once before first migration if needed.
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
