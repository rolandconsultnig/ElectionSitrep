/**
 * Generates database/migration_011_inec_lgas.sql from database/data/nigeria_lgas.json
 * (public dataset: xosasx/nigerian-local-government-areas, lgas.json).
 * Run: node server/scripts/build-migration-011-lgas.mjs
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '../..')
const jsonPath = path.join(root, 'database/data/nigeria_lgas.json')
const outPath = path.join(root, 'database/migration_011_inec_lgas.sql')

function sqlStr(s) {
  return "'" + String(s).replace(/'/g, "''") + "'"
}

function sqlNum(n) {
  const x = Number(n)
  if (!Number.isFinite(x)) return '0'
  return String(x)
}

const rows = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
if (!Array.isArray(rows) || rows.length !== 774) {
  console.error('[build-migration-011] Expected 774 LGAs, got', rows?.length)
  process.exit(1)
}

const byState = new Map()
for (const r of rows) {
  const sc = r.state_code
  if (!byState.has(sc)) byState.set(sc, [])
  byState.get(sc).push(r)
}

const valueLines = []
for (const [, list] of byState) {
  list.sort((a, b) => String(a.name).localeCompare(String(b.name), 'en'))
  let seq = 1
  for (const r of list) {
    const code = `${r.state_code}-${String(seq).padStart(3, '0')}`
    seq += 1
    valueLines.push(
      `(${sqlStr(r.state_code)}, ${sqlStr(code)}, ${sqlStr(r.name)}, ${sqlNum(r.latitude)}, ${sqlNum(r.longitude)})`
    )
  }
}

const header = `-- INEC-style LGA catalog (774 LGAs). Source: database/data/nigeria_lgas.json
-- Derived from public dataset xosasx/nigerian-local-government-areas (lgas.json).
BEGIN;

-- Drop election scope pointers into geography rows we are about to remove.
WITH doomed AS (
  SELECT id FROM geo_lgas
  WHERE code LIKE '%-GEN'
     OR name = 'General (detailed INEC catalog pending)'
     OR name LIKE 'District % (INEC catalog pending)%'
     OR code ~ '^[A-Z]{2}-P[0-9]{2}$'
     OR code IN ('LA-IKE', 'LA-SUR', 'FC-AMC', 'KN-MUN')
),
ward_ids AS (
  SELECT w.id FROM geo_wards w INNER JOIN doomed d ON w.lga_id = d.id
),
pu_ids AS (
  SELECT p.id FROM geo_polling_units p
  INNER JOIN geo_wards w ON w.id = p.ward_id
  INNER JOIN doomed d ON w.lga_id = d.id
)
DELETE FROM election_scope_items esi
WHERE (esi.level = 'pu' AND esi.ref_id IN (SELECT id FROM pu_ids))
   OR (esi.level = 'ward' AND esi.ref_id IN (SELECT id FROM ward_ids))
   OR (esi.level = 'lga' AND esi.ref_id IN (SELECT id FROM doomed));

DELETE FROM geo_lgas
WHERE code LIKE '%-GEN'
   OR name = 'General (detailed INEC catalog pending)'
   OR name LIKE 'District % (INEC catalog pending)%'
   OR code ~ '^[A-Z]{2}-P[0-9]{2}$'
   OR code IN ('LA-IKE', 'LA-SUR', 'FC-AMC', 'KN-MUN');

INSERT INTO geo_lgas (state_id, code, name, center_lat, center_lng)
SELECT s.id, v.code, v.name, v.lat, v.lng
FROM geo_states s
INNER JOIN (
VALUES
`

const footer = `
) AS v(state_code, code, name, lat, lng) ON s.code = v.state_code
ON CONFLICT (code) DO UPDATE SET
  state_id = EXCLUDED.state_id,
  name = EXCLUDED.name,
  center_lat = EXCLUDED.center_lat,
  center_lng = EXCLUDED.center_lng;

-- Minimal ward + PU per LGA when missing (same pattern as migration 008).
INSERT INTO geo_wards (lga_id, code, name)
SELECT l.id,
       l.code || '-W01',
       'Ward 01 (placeholder)'
FROM geo_lgas l
WHERE NOT EXISTS (SELECT 1 FROM geo_wards w WHERE w.lga_id = l.id)
ON CONFLICT (lga_id, code) DO NOTHING;

INSERT INTO geo_polling_units (ward_id, code, name, lat, lng)
SELECT w.id,
       'PU-' || w.id::text,
       'Polling unit (placeholder)',
       lg.center_lat,
       lg.center_lng
FROM geo_wards w
JOIN geo_lgas lg ON lg.id = w.lga_id
WHERE NOT EXISTS (SELECT 1 FROM geo_polling_units p WHERE p.ward_id = w.id)
ON CONFLICT (ward_id, code) DO NOTHING;

UPDATE geography_summary SET
  states_and_fct = (SELECT COUNT(*)::int FROM geo_states),
  lgas = (SELECT COUNT(*)::int FROM geo_lgas),
  wards = (SELECT COUNT(*)::int FROM geo_wards),
  polling_units = (SELECT COUNT(*)::int FROM geo_polling_units),
  updated_at = now()
WHERE id = 1;

COMMIT;
`

const body = valueLines.join(',\n')
fs.writeFileSync(outPath, header + body + footer, 'utf8')
console.log('[build-migration-011] Wrote', outPath, `(${valueLines.length} LGAs)`)
