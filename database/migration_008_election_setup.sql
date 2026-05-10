-- Election category, party/candidate slots per election, geographic scope selections
BEGIN;

ALTER TABLE elections
  ADD COLUMN IF NOT EXISTS election_category VARCHAR(32) NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS is_rerun BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS governorship_state_id INT REFERENCES geo_states (id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS election_party_candidates (
  election_id UUID NOT NULL REFERENCES elections (id) ON DELETE CASCADE,
  party_id UUID NOT NULL REFERENCES political_parties (id) ON DELETE CASCADE,
  candidate_name TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (election_id, party_id)
);

CREATE INDEX IF NOT EXISTS idx_election_party_candidates_election ON election_party_candidates (election_id);

CREATE TABLE IF NOT EXISTS election_scope_items (
  id BIGSERIAL PRIMARY KEY,
  election_id UUID NOT NULL REFERENCES elections (id) ON DELETE CASCADE,
  level VARCHAR(8) NOT NULL CHECK (level IN ('state', 'lga', 'ward', 'pu')),
  ref_id INT NOT NULL,
  included BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (election_id, level, ref_id)
);

CREATE INDEX IF NOT EXISTS idx_election_scope_election ON election_scope_items (election_id);

-- Expand geo_states to all 36 states + FCT (approximate centres for listing / maps). Existing LA, FC, KN unchanged.
INSERT INTO geo_states (code, name, sort_order, center_lat, center_lng)
VALUES
  ('AB', 'Abia', 10, 5.5333, 7.4833),
  ('AD', 'Adamawa', 11, 9.3265, 12.3984),
  ('AK', 'Akwa Ibom', 12, 4.9057, 8.3214),
  ('AN', 'Anambra', 13, 6.2209, 7.0729),
  ('BA', 'Bauchi', 14, 10.6158, 9.8445),
  ('BY', 'Bayelsa', 15, 4.9267, 6.2676),
  ('BE', 'Benue', 16, 7.3369, 8.7404),
  ('BO', 'Borno', 17, 11.8333, 13.1500),
  ('CR', 'Cross River', 18, 5.8705, 8.7094),
  ('DE', 'Delta', 19, 5.5320, 5.7553),
  ('EB', 'Ebonyi', 20, 6.2518, 8.0836),
  ('ED', 'Edo', 21, 6.5438, 5.8987),
  ('EK', 'Ekiti', 22, 7.7184, 5.3103),
  ('EN', 'Enugu', 23, 6.4584, 7.5464),
  ('GO', 'Gombe', 24, 10.2670, 11.1714),
  ('IM', 'Imo', 25, 5.4763, 7.0264),
  ('JI', 'Jigawa', 26, 11.4941, 9.5819),
  ('KD', 'Kaduna', 27, 10.6093, 7.4295),
  ('KT', 'Katsina', 28, 12.9888, 7.6179),
  ('KE', 'Kebbi', 29, 12.0785, 4.3947),
  ('KO', 'Kogi', 30, 7.5619, 6.5784),
  ('KW', 'Kwara', 31, 8.9848, 4.5628),
  ('NA', 'Nasarawa', 33, 8.5601, 8.0843),
  ('NI', 'Niger', 34, 9.6139, 6.5564),
  ('OG', 'Ogun', 35, 7.1600, 3.3500),
  ('ON', 'Ondo', 36, 7.0833, 4.8333),
  ('OS', 'Osun', 37, 7.7667, 4.5667),
  ('OY', 'Oyo', 38, 8.1574, 3.6147),
  ('PL', 'Plateau', 39, 9.8965, 8.8583),
  ('RI', 'Rivers', 40, 4.8396, 6.9124),
  ('SO', 'Sokoto', 41, 13.0533, 5.3223),
  ('TA', 'Taraba', 42, 8.8833, 11.3667),
  ('YO', 'Yobe', 43, 11.7411, 11.9669),
  ('ZA', 'Zamfara', 44, 12.2516, 6.6646)
ON CONFLICT (code) DO NOTHING;

-- One placeholder LGA per state that has no LGA row yet (catalog expansion pending).
INSERT INTO geo_lgas (state_id, code, name, center_lat, center_lng)
SELECT s.id,
       s.code || '-GEN',
       'General (detailed INEC catalog pending)',
       s.center_lat,
       s.center_lng
FROM geo_states s
WHERE NOT EXISTS (SELECT 1 FROM geo_lgas l WHERE l.state_id = s.id)
ON CONFLICT (code) DO NOTHING;

-- One ward + one PU per LGA that has no wards yet.
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
