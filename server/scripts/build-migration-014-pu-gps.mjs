/**
 * Builds database/migration_014_pu_gps.sql — UPDATE geo_polling_units lat/lng from
 * database/data/inec_polling_units_gps.csv (mykeels/inec-polling-units).
 *
 * Matches catalog PUs by (name, ward, LGA, state), with Nigeria bbox filtering for coords.
 * Fallback: unique (name, LGA, state) within that CSV when ward wording differs.
 *
 * Run: node server/scripts/build-migration-014-pu-gps.mjs
 */
import fs from 'fs'
import path from 'path'
import { parse } from 'csv-parse/sync'
import { fileURLToPath } from 'url'
import { buildNpmGeoMaps, compress } from './lib/npm-geo-bridge.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '../..')

function sqlStr(s) {
  return "'" + String(s).replace(/'/g, "''") + "'"
}

function sqlNum(n) {
  const x = Number(n)
  if (!Number.isFinite(x)) return 'NULL'
  return String(x)
}

function norm(s) {
  return String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim()
}

function joinKey4(name, ward, lga, state) {
  return [compress(norm(name)), compress(norm(ward)), compress(norm(lga)), compress(norm(state))].join('|')
}

function joinKey3(name, lga, state) {
  return [compress(norm(name)), compress(norm(lga)), compress(norm(state))].join('|')
}

function inNigeria(lat, lng) {
  const la = Number(lat)
  const ln = Number(lng)
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return false
  return la >= 4 && la <= 14 && ln >= 2 && ln <= 15
}

const csvPath = path.join(root, 'database/data/inec_polling_units_gps.csv')
if (!fs.existsSync(csvPath)) {
  console.error('[build-migration-014] Missing', csvPath)
  console.error(
    'Download from https://github.com/mykeels/inec-polling-units/raw/master/polling-units.csv',
  )
  process.exit(1)
}

const rawCsv = fs.readFileSync(csvPath, 'utf8')
const records = parse(rawCsv, {
  columns: true,
  skip_empty_lines: true,
  relax_quotes: true,
  trim: true,
})

const gpsByFull = new Map()
const tripleOccurrences = new Map()

for (const r of records) {
  const lat = r['location.latitude']
  const lng = r['location.longitude']
  if (!inNigeria(lat, lng)) continue
  const name = r.name
  const ward = r.ward_name
  const lga = r.local_government_name
  const state = r.state_name
  const k4 = joinKey4(name, ward, lga, state)
  const k3 = joinKey3(name, lga, state)
  tripleOccurrences.set(k3, (tripleOccurrences.get(k3) || 0) + 1)
  if (!gpsByFull.has(k4)) {
    gpsByFull.set(k4, { lat: Number(lat), lng: Number(lng) })
  }
}

const gpsByTripleUnique = new Map()
for (const r of records) {
  const lat = r['location.latitude']
  const lng = r['location.longitude']
  if (!inNigeria(lat, lng)) continue
  const k3 = joinKey3(r.name, r.local_government_name, r.state_name)
  if (tripleOccurrences.get(k3) === 1) {
    gpsByTripleUnique.set(k3, { lat: Number(lat), lng: Number(lng) })
  }
}

let npmWardIdToWardCode
try {
  ;({ npmWardIdToWardCode } = buildNpmGeoMaps(root))
} catch (e) {
  console.error('[build-migration-014]', e.message)
  if (e.unmatched) for (const u of e.unmatched) console.error(JSON.stringify(u))
  process.exit(1)
}

const WARDS = JSON.parse(fs.readFileSync(path.join(root, 'database/data/wards_catalog.json'), 'utf8'))
const NPM_LGAS = JSON.parse(fs.readFileSync(path.join(root, 'database/data/lgas_npm_bridge.json'), 'utf8'))
const lgaIdToMeta = new Map()
for (const r of NPM_LGAS) {
  lgaIdToMeta.set(String(r.id), { state: r.state_name, lga: r.local_government_name })
}

const puByWard = JSON.parse(fs.readFileSync(path.join(root, 'database/data/polling_units_by_ward.json'), 'utf8'))

const updates = []
let hit4 = 0
let hit3 = 0
let miss = 0

for (const w of WARDS) {
  const meta = lgaIdToMeta.get(String(w.lga_id))
  if (!meta) throw new Error(`Missing lga ${w.lga_id}`)
  const wardCodePrefix = npmWardIdToWardCode.get(String(w.id))
  if (!wardCodePrefix) throw new Error(`Missing ward ${w.id}`)
  const list = puByWard[String(w.id)] || []
  list.forEach((pu, idx) => {
    const seq = String(idx + 1).padStart(3, '0')
    const code = `${wardCodePrefix}-${seq}`
    const pname = pu?.name ?? ''
    const k4 = joinKey4(pname, w.ward_name, meta.lga, meta.state)
    let g = gpsByFull.get(k4)
    if (g) {
      hit4++
    } else {
      const k3 = joinKey3(pname, meta.lga, meta.state)
      g = gpsByTripleUnique.get(k3)
      if (g) hit3++
    }
    if (g) updates.push({ code, lat: g.lat, lng: g.lng })
    else miss++
  })
}

console.log(
  '[build-migration-014] GPS updates:',
  updates.length,
  '(full-key:',
  hit4,
  'triple-fallback:',
  hit3,
  ') unmatched:',
  miss,
)

const CHUNK = 350
const header = `-- Apply PU coordinates from mykeels/inec-polling-units (polling-units.csv → database/data/inec_polling_units_gps.csv).
-- Nigeria bounding-box filter on CSV coords; rows without a match keep migration_013 LGA-centre defaults.
BEGIN;

`

let body = ''
for (let i = 0; i < updates.length; i += CHUNK) {
  const chunk = updates.slice(i, i + CHUNK)
  const values = chunk.map((r) => `(${sqlStr(r.code)}, ${sqlNum(r.lat)}, ${sqlNum(r.lng)})`).join(',\n')
  body += `UPDATE geo_polling_units AS gp
SET lat = v.lat::double precision, lng = v.lng::double precision
FROM (
VALUES
${values}
) AS v(code, lat, lng)
WHERE gp.code = v.code;\n\n`
}

const footer = `UPDATE geography_summary SET
  polling_units = (SELECT COUNT(*)::int FROM geo_polling_units),
  updated_at = now()
WHERE id = 1;

COMMIT;
`

const outPath = path.join(root, 'database/migration_014_pu_gps.sql')
fs.writeFileSync(outPath, header + body + footer, 'utf8')
console.log('[build-migration-014] Wrote', outPath, 'chunks:', Math.ceil(updates.length / CHUNK))
