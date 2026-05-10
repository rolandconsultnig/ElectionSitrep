-- States that only had the single *-GEN placeholder LGA get extra navigable rows until a full INEC import.
-- Does not alter states that already have multiple real LGAs (e.g. Lagos from migration 006).
BEGIN;

INSERT INTO geo_lgas (state_id, code, name, center_lat, center_lng)
SELECT s.id,
       s.code || '-P' || LPAD(n::text, 2, '0'),
       'District ' || n || ' (INEC catalog pending)',
       s.center_lat,
       s.center_lng
FROM geo_states s
INNER JOIN geo_lgas gen ON gen.state_id = s.id AND gen.code = s.code || '-GEN'
CROSS JOIN generate_series(2, 24) AS n
WHERE (SELECT COUNT(*)::int FROM geo_lgas l WHERE l.state_id = s.id) = 1
ON CONFLICT (code) DO NOTHING;

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

COMMIT;
