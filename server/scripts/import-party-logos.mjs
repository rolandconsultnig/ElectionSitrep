/**
 * Load party logos from repo-root party_logo/ into PostgreSQL (logo_image BYTEA, logo_mime).
 * Expected filenames: {nn}_{ABBREV}_{DESCRIPTION}.png — maps by ABBREV (unique in parties_annex.json).
 * Fallback: leading number nn matches annexSn when abbreviation parsing fails.
 *
 * Requires DATABASE_URL in .env.local or .env at repo root.
 * Run: npm run import-party-logos --prefix server
 */
import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'
import pg from 'pg'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '../..')
dotenv.config({ path: path.join(ROOT, '.env.local') })
dotenv.config({ path: path.join(ROOT, '.env') })

const PARTY_LOGO_DIR = path.join(ROOT, 'party_logo')
const ANNEX_JSON = path.join(ROOT, 'database/parties_annex.json')

const EXT_TO_MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
}

function mimeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  return EXT_TO_MIME[ext] ?? null
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error('[import-party-logos] DATABASE_URL is not set.')
    process.exit(1)
  }
  if (!fs.existsSync(PARTY_LOGO_DIR)) {
    console.error('[import-party-logos] Missing directory:', PARTY_LOGO_DIR)
    process.exit(1)
  }
  if (!fs.existsSync(ANNEX_JSON)) {
    console.error('[import-party-logos] Missing', ANNEX_JSON)
    process.exit(1)
  }

  const annex = JSON.parse(fs.readFileSync(ANNEX_JSON, 'utf8'))
  const byAbbrev = new Map()
  const byAnnexSn = new Map()
  for (const row of annex) {
    byAbbrev.set(String(row.abbreviation).toUpperCase(), row)
    byAnnexSn.set(Number(row.annexSn), row)
  }

  const files = fs.readdirSync(PARTY_LOGO_DIR).filter((f) => mimeFor(path.join(PARTY_LOGO_DIR, f)))
  if (files.length === 0) {
    console.log('[import-party-logos] No supported images in', PARTY_LOGO_DIR)
    return
  }

  const pool = new pg.Pool({ connectionString: databaseUrl })
  let updated = 0
  let skipped = 0
  const warnings = []

  try {
    for (const fn of files.sort()) {
      const full = path.join(PARTY_LOGO_DIR, fn)
      const mime = mimeFor(full)
      const base = path.basename(fn, path.extname(fn))
      const parts = base.split('_')

      let row = null
      if (parts.length >= 2) {
        const abbrev = String(parts[1]).toUpperCase()
        row = byAbbrev.get(abbrev)
      }
      if (!row && parts.length >= 1) {
        const sn = parseInt(parts[0], 10)
        if (Number.isFinite(sn)) row = byAnnexSn.get(sn) ?? null
      }
      if (!row) {
        warnings.push(`No party match for file: ${fn}`)
        skipped += 1
        continue
      }

      const buf = fs.readFileSync(full)
      const code = row.inecRegisterCode
      const r = await pool.query(
        `UPDATE political_parties
         SET logo_image = $1, logo_mime = $2, logo_url = NULL, updated_at = now()
         WHERE inec_register_code = $3`,
        [buf, mime, code],
      )
      if (r.rowCount === 0) {
        warnings.push(`No DB row for ${code} (${fn})`)
        skipped += 1
        continue
      }
      updated += 1
      console.log('[import-party-logos]', row.abbreviation, '←', fn)
    }
  } finally {
    await pool.end()
  }

  console.log(`[import-party-logos] Done. Updated ${updated} parties. Skipped ${skipped}.`)
  if (warnings.length) {
    console.warn('[import-party-logos] Warnings:')
    for (const w of warnings) console.warn(' ', w)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
