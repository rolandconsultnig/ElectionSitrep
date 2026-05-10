/**
 * Builds database/migration_013_inec_polling_units.sql from:
 * - database/data/polling_units_by_ward.json (~202k PUs from npm INEC package)
 * - Ward codes via server/scripts/lib/npm-geo-bridge.mjs (same as migration 012)
 *
 * Coordinates use parent LGA centre (catalog has venue names only).
 * Run: node server/scripts/build-migration-013-polling-units.mjs
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { buildNpmGeoMaps } from './lib/npm-geo-bridge.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '../..')

function sqlStr(s) {
  return "'" + String(s).replace(/'/g, "''") + "'"
}

const puPath = path.join(root, 'database/data/polling_units_by_ward.json')
if (!fs.existsSync(puPath)) {
  console.error('[build-migration-013] Missing', puPath)
  console.error('Copy polling-units-by-ward.json from nigerian-states-lgas-and-polling-units package into database/data/polling_units_by_ward.json')
  process.exit(1)
}

let npmWardIdToWardCode
try {
  ;({ npmWardIdToWardCode } = buildNpmGeoMaps(root))
} catch (e) {
  console.error('[build-migration-013]', e.message)
  if (e.unmatched) for (const u of e.unmatched) console.error(JSON.stringify(u))
  process.exit(1)
}

const puByWard = JSON.parse(fs.readFileSync(puPath, 'utf8'))

const puRows = []
for (const [wardIdStr, list] of Object.entries(puByWard)) {
  const wardCode = npmWardIdToWardCode.get(wardIdStr)
  if (!wardCode) {
    console.error('[build-migration-013] Unknown ward id in PU file:', wardIdStr)
    process.exit(1)
  }
  if (!Array.isArray(list)) continue
  list.forEach((pu, idx) => {
    const seq = String(idx + 1).padStart(3, '0')
    const code = `${wardCode}-${seq}`
    const name = String(pu?.name ?? '').trim()
    puRows.push({ wardCode, code, name })
  })
}

console.log('[build-migration-013] Polling units:', puRows.length)

const CHUNK = 350
const header = `-- INEC polling units (~202k) from npm package nigerian-states-lgas-and-polling-units (polling-units-by-ward.json).
-- Lat/lng from parent LGA centre (venue-only catalog).
BEGIN;

DELETE FROM election_scope_items WHERE level = 'pu';

DELETE FROM geo_polling_units;

`

let body = ''
for (let i = 0; i < puRows.length; i += CHUNK) {
  const chunk = puRows.slice(i, i + CHUNK)
  const values = chunk
    .map((r) => `(${sqlStr(r.wardCode)}, ${sqlStr(r.code)}, ${sqlStr(r.name)})`)
    .join(',\n')
  body += `INSERT INTO geo_polling_units (ward_id, code, name, lat, lng)
SELECT w.id, v.code, v.name, lg.center_lat, lg.center_lng
FROM geo_wards w
JOIN geo_lgas lg ON lg.id = w.lga_id
INNER JOIN (
VALUES
${values}
) AS v(ward_code, code, name) ON w.code = v.ward_code;\n\n`
}

const footer = `UPDATE geography_summary SET
  states_and_fct = (SELECT COUNT(*)::int FROM geo_states),
  lgas = (SELECT COUNT(*)::int FROM geo_lgas),
  wards = (SELECT COUNT(*)::int FROM geo_wards),
  polling_units = (SELECT COUNT(*)::int FROM geo_polling_units),
  updated_at = now()
WHERE id = 1;

COMMIT;
`

const outPath = path.join(root, 'database/migration_013_inec_polling_units.sql')
fs.writeFileSync(outPath, header + body + footer, 'utf8')
console.log('[build-migration-013] Wrote', outPath)
console.log('[build-migration-013] INSERT chunks:', Math.ceil(puRows.length / CHUNK))
