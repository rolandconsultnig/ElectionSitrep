-- Cascading geography (demo subset) + simplified polygons for map overlays
BEGIN;

CREATE TABLE IF NOT EXISTS geo_states (
  id SERIAL PRIMARY KEY,
  code VARCHAR(8) UNIQUE NOT NULL,
  name TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  center_lat DOUBLE PRECISION NOT NULL,
  center_lng DOUBLE PRECISION NOT NULL,
  boundary_geojson JSONB
);

CREATE TABLE IF NOT EXISTS geo_lgas (
  id SERIAL PRIMARY KEY,
  state_id INT NOT NULL REFERENCES geo_states (id) ON DELETE CASCADE,
  code VARCHAR(24) UNIQUE NOT NULL,
  name TEXT NOT NULL,
  center_lat DOUBLE PRECISION NOT NULL,
  center_lng DOUBLE PRECISION NOT NULL,
  boundary_geojson JSONB
);

CREATE INDEX IF NOT EXISTS idx_geo_lgas_state ON geo_lgas (state_id);

CREATE TABLE IF NOT EXISTS geo_wards (
  id SERIAL PRIMARY KEY,
  lga_id INT NOT NULL REFERENCES geo_lgas (id) ON DELETE CASCADE,
  code VARCHAR(32) NOT NULL,
  name TEXT NOT NULL,
  UNIQUE (lga_id, code)
);

CREATE INDEX IF NOT EXISTS idx_geo_wards_lga ON geo_wards (lga_id);

CREATE TABLE IF NOT EXISTS geo_polling_units (
  id SERIAL PRIMARY KEY,
  ward_id INT NOT NULL REFERENCES geo_wards (id) ON DELETE CASCADE,
  code VARCHAR(48) NOT NULL,
  name TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  UNIQUE (ward_id, code)
);

CREATE INDEX IF NOT EXISTS idx_geo_pu_ward ON geo_polling_units (ward_id);

INSERT INTO geo_states (code, name, sort_order, center_lat, center_lng, boundary_geojson)
VALUES
  (
    'LA',
    'Lagos',
    1,
    6.5244,
    3.3792,
    '{"type":"Polygon","coordinates":[[[3.15,6.35],[3.65,6.35],[3.65,6.75],[3.15,6.75],[3.15,6.35]]]}'::jsonb
  ),
  (
    'FC',
    'FCT',
    2,
    9.0765,
    7.3986,
    '{"type":"Polygon","coordinates":[[[7.35,8.95],[7.55,8.95],[7.55,9.15],[7.35,9.15],[7.35,8.95]]]}'::jsonb
  ),
  (
    'KN',
    'Kano',
    3,
    12.0022,
    8.592,
    '{"type":"Polygon","coordinates":[[[8.35,11.85],[8.85,11.85],[8.85,12.15],[8.35,12.15],[8.35,11.85]]]}'::jsonb
  )
ON CONFLICT (code) DO NOTHING;

INSERT INTO geo_lgas (state_id, code, name, center_lat, center_lng, boundary_geojson)
SELECT s.id,
       'LA-IKE',
       'Ikeja',
       6.6018,
       3.3515,
       '{"type":"Polygon","coordinates":[[[3.28,6.52],[3.42,6.52],[3.42,6.62],[3.28,6.62],[3.28,6.52]]]}'::jsonb
FROM geo_states s
WHERE s.code = 'LA'
ON CONFLICT (code) DO NOTHING;

INSERT INTO geo_lgas (state_id, code, name, center_lat, center_lng, boundary_geojson)
SELECT s.id,
       'LA-SUR',
       'Surulere',
       6.5059,
       3.3517,
       '{"type":"Polygon","coordinates":[[[3.30,6.44],[3.44,6.44],[3.44,6.54],[3.30,6.54],[3.30,6.44]]]}'::jsonb
FROM geo_states s
WHERE s.code = 'LA'
ON CONFLICT (code) DO NOTHING;

INSERT INTO geo_lgas (state_id, code, name, center_lat, center_lng, boundary_geojson)
SELECT s.id,
       'FC-AMC',
       'Abuja Municipal',
       9.0579,
       7.4951,
       '{"type":"Polygon","coordinates":[[[7.42,9.00],[7.52,9.00],[7.52,9.08],[7.42,9.08],[7.42,9.00]]]}'::jsonb
FROM geo_states s
WHERE s.code = 'FC'
ON CONFLICT (code) DO NOTHING;

INSERT INTO geo_lgas (state_id, code, name, center_lat, center_lng, boundary_geojson)
SELECT s.id,
       'KN-MUN',
       'Kano Municipal',
       12.0007,
       8.5167,
       '{"type":"Polygon","coordinates":[[[8.48,11.96],[8.62,11.96],[8.62,12.05],[8.48,12.05],[8.48,11.96]]]}'::jsonb
FROM geo_states s
WHERE s.code = 'KN'
ON CONFLICT (code) DO NOTHING;

INSERT INTO geo_wards (lga_id, code, name)
SELECT l.id, 'LA-IKE-W01', 'Ogba / Ojodu'
FROM geo_lgas l
WHERE l.code = 'LA-IKE'
ON CONFLICT (lga_id, code) DO NOTHING;

INSERT INTO geo_wards (lga_id, code, name)
SELECT l.id, 'LA-IKE-W02', 'Onigbongbo'
FROM geo_lgas l
WHERE l.code = 'LA-IKE'
ON CONFLICT (lga_id, code) DO NOTHING;

INSERT INTO geo_wards (lga_id, code, name)
SELECT l.id, 'LA-SUR-W01', 'Surulere Central'
FROM geo_lgas l
WHERE l.code = 'LA-SUR'
ON CONFLICT (lga_id, code) DO NOTHING;

INSERT INTO geo_wards (lga_id, code, name)
SELECT l.id, 'FC-AMC-W01', 'Garki'
FROM geo_lgas l
WHERE l.code = 'FC-AMC'
ON CONFLICT (lga_id, code) DO NOTHING;

INSERT INTO geo_wards (lga_id, code, name)
SELECT l.id, 'FC-AMC-W02', 'Wuse'
FROM geo_lgas l
WHERE l.code = 'FC-AMC'
ON CONFLICT (lga_id, code) DO NOTHING;

INSERT INTO geo_wards (lga_id, code, name)
SELECT l.id, 'KN-MUN-W01', 'Nasarawa GRA'
FROM geo_lgas l
WHERE l.code = 'KN-MUN'
ON CONFLICT (lga_id, code) DO NOTHING;

INSERT INTO geo_polling_units (ward_id, code, name, lat, lng)
SELECT w.id, 'PU-LA-IKE-001', 'PU Ogba Town Hall', 6.612, 3.343
FROM geo_wards w
WHERE w.code = 'LA-IKE-W01'
ON CONFLICT (ward_id, code) DO NOTHING;

INSERT INTO geo_polling_units (ward_id, code, name, lat, lng)
SELECT w.id, 'PU-LA-IKE-002', 'PU Acme Road', 6.598, 3.358
FROM geo_wards w
WHERE w.code = 'LA-IKE-W02'
ON CONFLICT (ward_id, code) DO NOTHING;

INSERT INTO geo_polling_units (ward_id, code, name, lat, lng)
SELECT w.id, 'PU-LA-SUR-001', 'PU Stadium vicinity', 6.508, 3.355
FROM geo_wards w
WHERE w.code = 'LA-SUR-W01'
ON CONFLICT (ward_id, code) DO NOTHING;

INSERT INTO geo_polling_units (ward_id, code, name, lat, lng)
SELECT w.id, 'PU-FC-001', 'PU Garki Model', 9.048, 7.489
FROM geo_wards w
WHERE w.code = 'FC-AMC-W01'
ON CONFLICT (ward_id, code) DO NOTHING;

INSERT INTO geo_polling_units (ward_id, code, name, lat, lng)
SELECT w.id, 'PU-FC-002', 'PU Wuse Market zone', 9.079, 7.481
FROM geo_wards w
WHERE w.code = 'FC-AMC-W02'
ON CONFLICT (ward_id, code) DO NOTHING;

INSERT INTO geo_polling_units (ward_id, code, name, lat, lng)
SELECT w.id, 'PU-KN-001', 'PU Municipal Hub', 11.996, 8.522
FROM geo_wards w
WHERE w.code = 'KN-MUN-W01'
ON CONFLICT (ward_id, code) DO NOTHING;

COMMIT;
