/**
 * Builds database/migration_012_electoral_wards.sql from:
 * - database/data/wards_catalog.json (8957 wards from npm INEC package)
 * - database/data/lgas_npm_bridge.json (774 LGAs with npm id ↔ names)
 * - database/data/nigeria_lgas.json (same LGAs as geo_lgas; names used for matching)
 *
 * Wards only — real polling units are migration_013 (build-migration-013-polling-units.mjs).
 * Run: node server/scripts/build-migration-012-wards.mjs
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

let wardRows
try {
  ;({ wardRows } = buildNpmGeoMaps(root))
} catch (e) {
  console.error('[build-migration-012]', e.message)
  if (e.unmatched) for (const u of e.unmatched) console.error(JSON.stringify(u))
  process.exit(1)
}

const CHUNK = 400
const header = `-- Electoral wards (~8957) from INEC-style catalog (npm package nigerian-states-lgas-and-polling-units).
-- Joined to geo_lgas via npm↔xosasx LGA name matching (see server/scripts/lib/npm-geo-bridge.mjs).
BEGIN;

DELETE FROM election_scope_items WHERE level IN ('pu', 'ward');

DELETE FROM geo_polling_units;
DELETE FROM geo_wards;

`

let body = ''
for (let i = 0; i < wardRows.length; i += CHUNK) {
  const chunk = wardRows.slice(i, i + CHUNK)
  const values = chunk.map((r) => `(${sqlStr(r.lgaCode)}, ${sqlStr(r.wardCode)}, ${sqlStr(r.name)})`).join(',\n')
  body += `INSERT INTO geo_wards (lga_id, code, name)
SELECT lg.id, v.code, v.name
FROM geo_lgas lg
INNER JOIN (
VALUES
${values}
) AS v(lga_code, code, name) ON lg.code = v.lga_code;\n\n`
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

const outPath = path.join(root, 'database/migration_012_electoral_wards.sql')
fs.writeFileSync(outPath, header + body + footer, 'utf8')
console.log('[build-migration-012] Wrote', outPath)
console.log('[build-migration-012] Wards:', wardRows.length, 'chunks:', Math.ceil(wardRows.length / CHUNK))
