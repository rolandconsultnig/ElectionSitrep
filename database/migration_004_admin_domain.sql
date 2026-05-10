-- Election domain + dashboard aggregates (replaces hard-coded admin demo UI)
BEGIN;

ALTER TABLE political_parties
  ADD COLUMN IF NOT EXISTS annex_sn INT,
  ADD COLUMN IF NOT EXISTS presidential_candidate TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS political_parties_annex_sn_idx
  ON political_parties (annex_sn)
  WHERE annex_sn IS NOT NULL;

CREATE TABLE IF NOT EXISTS elections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(64) UNIQUE NOT NULL,
  name TEXT NOT NULL,
  election_type VARCHAR(64) NOT NULL,
  election_date DATE,
  jurisdictions_count INT NOT NULL DEFAULT 37,
  pu_count INT NOT NULL DEFAULT 176846,
  status VARCHAR(24) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'closed')),
  voting_close_time TIME,
  rule_enforcement TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS election_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  election_id UUID NOT NULL REFERENCES elections (id) ON DELETE CASCADE,
  party_id UUID NOT NULL REFERENCES political_parties (id) ON DELETE CASCADE,
  candidate_name TEXT NOT NULL,
  running_mate_name TEXT,
  nomination_status VARCHAR(32) NOT NULL DEFAULT 'confirmed'
    CHECK (nomination_status IN ('confirmed', 'pending', 'withdrawn')),
  UNIQUE (election_id, party_id)
);

CREATE INDEX IF NOT EXISTS idx_election_candidates_election ON election_candidates (election_id);

CREATE TABLE IF NOT EXISTS geography_summary (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  states_and_fct INT NOT NULL,
  lgas INT NOT NULL,
  wards INT NOT NULL,
  polling_units INT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dashboard_kpis (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  registered_pus INT NOT NULL,
  active_field_officers INT NOT NULL,
  pending_approvals INT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dashboard_hourly_metrics (
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  hour_slot SMALLINT NOT NULL CHECK (hour_slot IN (0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22)),
  submissions BIGINT NOT NULL DEFAULT 0,
  incidents BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (snapshot_date, hour_slot)
);

CREATE TABLE IF NOT EXISTS readiness_items (
  id SERIAL PRIMARY KEY,
  sort_order INT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  status VARCHAR(16) NOT NULL CHECK (status IN ('done', 'progress', 'pending'))
);

INSERT INTO geography_summary (id, states_and_fct, lgas, wards, polling_units)
VALUES (1, 37, 774, 8809, 176846)
ON CONFLICT (id) DO UPDATE SET
  states_and_fct = EXCLUDED.states_and_fct,
  lgas = EXCLUDED.lgas,
  wards = EXCLUDED.wards,
  polling_units = EXCLUDED.polling_units,
  updated_at = now();

INSERT INTO dashboard_kpis (id, registered_pus, active_field_officers, pending_approvals)
VALUES (1, 176846, 52314, 7)
ON CONFLICT (id) DO UPDATE SET
  registered_pus = EXCLUDED.registered_pus,
  active_field_officers = EXCLUDED.active_field_officers,
  pending_approvals = EXCLUDED.pending_approvals,
  updated_at = now();

INSERT INTO readiness_items (sort_order, label, status) VALUES
  (1, 'Setup & config', 'done'),
  (2, 'Party registration', 'done'),
  (3, 'Agent provisioning', 'progress'),
  (4, 'PU assignment', 'progress'),
  (5, 'Audit seal', 'pending')
ON CONFLICT (sort_order) DO UPDATE SET
  label = EXCLUDED.label,
  status = EXCLUDED.status;

-- Demo chart (same shape as prior UI); refresh dates via seed if needed
INSERT INTO dashboard_hourly_metrics (snapshot_date, hour_slot, submissions, incidents) VALUES
  (CURRENT_DATE, 0, 0, 0),
  (CURRENT_DATE, 2, 0, 0),
  (CURRENT_DATE, 4, 0, 0),
  (CURRENT_DATE, 6, 0, 0),
  (CURRENT_DATE, 8, 2140, 12),
  (CURRENT_DATE, 10, 8820, 48),
  (CURRENT_DATE, 12, 12400, 92),
  (CURRENT_DATE, 14, 15200, 134),
  (CURRENT_DATE, 16, 9800, 78),
  (CURRENT_DATE, 18, 4200, 31),
  (CURRENT_DATE, 20, 1200, 8),
  (CURRENT_DATE, 22, 300, 2)
ON CONFLICT (snapshot_date, hour_slot) DO NOTHING;

-- Elections are created via Admin → Election setup or POST /api/admin/elections (no default seed rows).

COMMIT;
