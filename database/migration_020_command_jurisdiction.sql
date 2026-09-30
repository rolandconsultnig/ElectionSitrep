-- Command-tier jurisdiction: which level of the command hierarchy a user operates at.
-- HQ/national users see everything; state commands see only their state; area commands
-- see only their LGA. Enforced by the scoped SitRep API (GET /api/sitreps).
BEGIN;

ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS jurisdiction_level VARCHAR(16) NOT NULL DEFAULT 'national'
    CHECK (jurisdiction_level IN ('national', 'state', 'area')),
  ADD COLUMN IF NOT EXISTS jurisdiction_state_id INT REFERENCES geo_states (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS jurisdiction_lga_id INT REFERENCES geo_lgas (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_app_users_jurisdiction_state ON app_users (jurisdiction_state_id);
CREATE INDEX IF NOT EXISTS idx_app_users_jurisdiction_lga ON app_users (jurisdiction_lga_id);

-- Structured situation reports authored from any portal (field web, state/area command, HQ).
-- Field-app offline captures continue to land in field_capture_outbox; GET /api/sitreps
-- merges both sources into one jurisdiction-scoped feed.
CREATE TABLE IF NOT EXISTS command_sitreps (
  id BIGSERIAL PRIMARY KEY,
  author_user_id UUID NOT NULL REFERENCES app_users (id) ON DELETE CASCADE,
  kind VARCHAR(16) NOT NULL DEFAULT 'sitrep' CHECK (kind IN ('sitrep', 'incident', 'violence')),
  category VARCHAR(64) NOT NULL DEFAULT 'general',
  severity VARCHAR(16) NOT NULL DEFAULT 'low' CHECK (severity IN ('low', 'medium', 'critical')),
  title VARCHAR(191) NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  election_slug VARCHAR(191),
  state_id INT REFERENCES geo_states (id) ON DELETE SET NULL,
  lga_id INT REFERENCES geo_lgas (id) ON DELETE SET NULL,
  ward_id INT REFERENCES geo_wards (id) ON DELETE SET NULL,
  pu_id INT REFERENCES geo_polling_units (id) ON DELETE SET NULL,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  status VARCHAR(16) NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'acknowledged', 'escalated', 'resolved')),
  acknowledged_by UUID REFERENCES app_users (id) ON DELETE SET NULL,
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_command_sitreps_state ON command_sitreps (state_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_command_sitreps_lga ON command_sitreps (lga_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_command_sitreps_created ON command_sitreps (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_command_sitreps_status ON command_sitreps (status);

COMMIT;
