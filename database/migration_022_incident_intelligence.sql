-- Phase 1 threat & incident intelligence: structured incident taxonomy with severity,
-- escalation ladder with SLA timers, FLASH priority, SOS/duress alerts with GPS trail,
-- and officer safety check-ins (dead man's switch) with device telemetry.
BEGIN;

CREATE TABLE IF NOT EXISTS incident_types (
  code VARCHAR(48) PRIMARY KEY,
  label VARCHAR(191) NOT NULL,
  category VARCHAR(48) NOT NULL,
  default_severity VARCHAR(16) NOT NULL CHECK (default_severity IN ('low', 'medium', 'high', 'critical')),
  sort_order INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true
);

INSERT INTO incident_types (code, label, category, default_severity, sort_order) VALUES
  ('ballot_box_snatching', 'Ballot-box snatching', 'electoral_offence', 'critical', 10),
  ('thuggery', 'Thuggery', 'security', 'high', 20),
  ('violence', 'Violence / gunfire', 'security', 'critical', 30),
  ('voter_intimidation', 'Voter intimidation', 'electoral_offence', 'high', 40),
  ('vote_buying', 'Vote buying', 'electoral_offence', 'medium', 50),
  ('bvas_failure', 'BVAS failure', 'technical', 'medium', 60),
  ('logistics_delay', 'Logistics delay', 'logistics', 'medium', 70),
  ('over_voting', 'Over-voting', 'electoral_offence', 'high', 80),
  ('result_sheet_tampering', 'Result-sheet tampering', 'electoral_offence', 'critical', 90),
  ('arrest_made', 'Arrest made', 'enforcement', 'low', 100),
  ('crowd_buildup', 'Crowd build-up', 'early_warning', 'medium', 110),
  ('arms_sighting', 'Arms sighting', 'early_warning', 'high', 120),
  ('other', 'Other', 'general', 'low', 999)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS incidents (
  id BIGSERIAL PRIMARY KEY,
  reporter_user_id UUID NOT NULL REFERENCES app_users (id) ON DELETE CASCADE,
  client_id VARCHAR(64),
  type_code VARCHAR(48) NOT NULL REFERENCES incident_types (code),
  severity VARCHAR(16) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  is_flash BOOLEAN NOT NULL DEFAULT false,
  title VARCHAR(191) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  state_id INT REFERENCES geo_states (id) ON DELETE SET NULL,
  lga_id INT REFERENCES geo_lgas (id) ON DELETE SET NULL,
  ward_id INT REFERENCES geo_wards (id) ON DELETE SET NULL,
  pu_id INT REFERENCES geo_polling_units (id) ON DELETE SET NULL,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  status VARCHAR(16) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved')),
  escalation_level VARCHAR(8) NOT NULL DEFAULT 'dpo' CHECK (escalation_level IN ('dpo', 'area', 'state', 'fhq')),
  sla_due_at TIMESTAMPTZ,
  acknowledged_by UUID REFERENCES app_users (id) ON DELETE SET NULL,
  acknowledged_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES app_users (id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  photo_data BYTEA,
  photo_mime VARCHAR(64),
  photo_sha256 CHAR(64),
  device_created_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (reporter_user_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_incidents_created ON incidents (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_state ON incidents (state_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_lga ON incidents (lga_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_sla_open ON incidents (sla_due_at) WHERE status = 'open';

CREATE TABLE IF NOT EXISTS incident_events (
  id BIGSERIAL PRIMARY KEY,
  incident_id BIGINT NOT NULL REFERENCES incidents (id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES app_users (id) ON DELETE SET NULL,
  action VARCHAR(32) NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_incident_events_incident ON incident_events (incident_id, created_at);

ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS duress_pin_hash VARCHAR(255),
  ADD COLUMN IF NOT EXISTS compromised_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS sos_alerts (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES app_users (id) ON DELETE CASCADE,
  kind VARCHAR(16) NOT NULL CHECK (kind IN ('panic', 'duress')),
  status VARCHAR(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resolved')),
  note TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES app_users (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_sos_alerts_active ON sos_alerts (status, started_at DESC);

CREATE TABLE IF NOT EXISTS sos_locations (
  id BIGSERIAL PRIMARY KEY,
  sos_id BIGINT NOT NULL REFERENCES sos_alerts (id) ON DELETE CASCADE,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  accuracy_m DOUBLE PRECISION,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sos_locations_sos ON sos_locations (sos_id, recorded_at);

CREATE TABLE IF NOT EXISTS officer_safety (
  user_id UUID PRIMARY KEY REFERENCES app_users (id) ON DELETE CASCADE,
  interval_minutes INT NOT NULL DEFAULT 60 CHECK (interval_minutes BETWEEN 5 AND 1440),
  last_ok_at TIMESTAMPTZ,
  next_due_at TIMESTAMPTZ,
  missed_flagged_at TIMESTAMPTZ,
  last_lat DOUBLE PRECISION,
  last_lng DOUBLE PRECISION,
  battery_pct INT,
  network VARCHAR(32),
  telemetry_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_officer_safety_due ON officer_safety (next_due_at) WHERE missed_flagged_at IS NULL;

COMMIT;
