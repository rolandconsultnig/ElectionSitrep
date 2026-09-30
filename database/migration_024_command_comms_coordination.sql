-- Migration 024: Phase 4 Command, Communications & Coordination
-- 1. Inter-Agency Taskforce Coordination (NPF, Military, NSCDC, DSS, FRSC)
-- 2. Multi-Level Command Directives & Flash Signal Broadcasting with Receipts
-- 3. Geofenced QRF Proximity Matcher & Rapid Alerting Rules
-- 4. Operations Situation Room Multi-Screen Wall Synchronization State

BEGIN;

-- 1. Inter-Agency Taskforce Agencies & Sector Commands
CREATE TABLE IF NOT EXISTS joint_taskforce_agencies (
  id BIGSERIAL PRIMARY KEY,
  election_id UUID REFERENCES elections(id) ON DELETE CASCADE,
  agency_code VARCHAR(32) NOT NULL CHECK (agency_code IN ('NPF', 'NA', 'NN', 'NAF', 'NSCDC', 'DSS', 'FRSC', 'NIS', 'NDLEA')),
  agency_name TEXT NOT NULL,
  sector_name TEXT NOT NULL,
  state_id INT REFERENCES geo_states(id) ON DELETE SET NULL,
  liaison_officer_name TEXT NOT NULL,
  liaison_officer_rank TEXT NOT NULL,
  liaison_officer_phone VARCHAR(64) NOT NULL,
  tactical_callsign VARCHAR(64) NOT NULL,
  radio_frequency VARCHAR(64) NOT NULL,
  deployed_personnel_count INT NOT NULL DEFAULT 0,
  patrol_vehicles_count INT NOT NULL DEFAULT 0,
  armored_vehicles_count INT NOT NULL DEFAULT 0,
  status VARCHAR(24) NOT NULL DEFAULT 'active' CHECK (status IN ('standby', 'active', 'engaged', 'relocating', 'stood_down')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_taskforce_agency_state ON joint_taskforce_agencies (state_id);
CREATE INDEX IF NOT EXISTS idx_taskforce_agency_code ON joint_taskforce_agencies (agency_code);
CREATE INDEX IF NOT EXISTS idx_taskforce_status ON joint_taskforce_agencies (status);

-- 2. Command Directives & Flash Signal Broadcasting
CREATE TABLE IF NOT EXISTS command_broadcast_directives (
  id BIGSERIAL PRIMARY KEY,
  election_id UUID REFERENCES elections(id) ON DELETE CASCADE,
  directive_code VARCHAR(64) UNIQUE NOT NULL,
  issuer_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  command_level VARCHAR(32) NOT NULL CHECK (command_level IN ('DPO', 'AREA_COMMAND', 'STATE_HQ', 'ZONAL_HQ', 'FHQ_IGP')),
  priority VARCHAR(24) NOT NULL CHECK (priority IN ('FLASH_SIGNAL', 'OPERATIONAL_ORDER', 'SECURITY_DIRECTIVE', 'STAND_DOWN')),
  target_scope VARCHAR(32) NOT NULL CHECK (target_scope IN ('nationwide', 'state', 'lga', 'taskforce_joint')),
  target_state_id INT REFERENCES geo_states(id) ON DELETE SET NULL,
  target_lga_id INT REFERENCES geo_lgas(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  directive_body TEXT NOT NULL,
  enforcement_deadline TIMESTAMPTZ,
  require_acknowledgment BOOLEAN NOT NULL DEFAULT true,
  status VARCHAR(24) NOT NULL DEFAULT 'broadcasted' CHECK (status IN ('draft', 'broadcasted', 'in_enforcement', 'completed', 'rescinded')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_directives_priority ON command_broadcast_directives (priority);
CREATE INDEX IF NOT EXISTS idx_directives_target_state ON command_broadcast_directives (target_state_id);
CREATE INDEX IF NOT EXISTS idx_directives_created ON command_broadcast_directives (created_at DESC);

-- Directive Acknowledgments / Delivery Receipts
CREATE TABLE IF NOT EXISTS directive_acknowledgments (
  id BIGSERIAL PRIMARY KEY,
  directive_id BIGINT NOT NULL REFERENCES command_broadcast_directives(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  officer_rank TEXT,
  command_jurisdiction TEXT,
  acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledgment_notes TEXT,
  CONSTRAINT uq_directive_user_ack UNIQUE (directive_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_directive_ack_directive ON directive_acknowledgments (directive_id);

-- 3. Geofenced QRF Proximity Matcher & Rapid Alerting Rules
CREATE TABLE IF NOT EXISTS geofenced_qrf_rules (
  id BIGSERIAL PRIMARY KEY,
  election_id UUID REFERENCES elections(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  min_severity VARCHAR(24) NOT NULL CHECK (min_severity IN ('medium', 'high', 'critical')),
  max_radius_km NUMERIC(5, 2) NOT NULL DEFAULT 15.00,
  auto_dispatch_enabled BOOLEAN NOT NULL DEFAULT false,
  alert_agencies JSONB NOT NULL DEFAULT '["NPF", "NSCDC"]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Situation Room Multi-Screen Wall Synchronization State
CREATE TABLE IF NOT EXISTS situation_room_synced_views (
  id INT PRIMARY KEY DEFAULT 1,
  active_layout VARCHAR(32) NOT NULL DEFAULT 'split_tactical' CHECK (active_layout IN ('split_tactical', 'full_map_hotspots', 'sitrep_ticker', 'results_wall', 'inter_agency_matrix')),
  active_state_id INT REFERENCES geo_states(id) ON DELETE SET NULL,
  active_election_id UUID REFERENCES elections(id) ON DELETE SET NULL,
  audio_alerts_enabled BOOLEAN NOT NULL DEFAULT true,
  last_controlled_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT single_synced_view CHECK (id = 1)
);

-- Seed initial situation room sync state
INSERT INTO situation_room_synced_views (id, active_layout, audio_alerts_enabled, updated_at)
VALUES (1, 'split_tactical', true, now())
ON CONFLICT (id) DO NOTHING;

-- Seed default Joint Taskforce Agencies
INSERT INTO joint_taskforce_agencies (agency_code, agency_name, sector_name, liaison_officer_name, liaison_officer_rank, liaison_officer_phone, tactical_callsign, radio_frequency, deployed_personnel_count, patrol_vehicles_count, armored_vehicles_count, status)
VALUES
  ('NPF', 'Nigeria Police Force (Tactical Strike Force)', 'Federal Capital / Central Command', 'CP Usman Bello', 'Commissioner of Police', '+234 803 111 2233', 'ALPHA-01', '142.850 MHz (Encrypted)', 1250, 85, 12, 'active'),
  ('NA', 'Nigerian Army (Operation Safe Conduct)', 'North Central Tactical Corridor', 'Brig. Gen. A. Ibrahim', 'Brigadier General', '+234 802 444 5566', 'THUNDER-COMMAND', 'Combat Net Radio 04', 850, 40, 18, 'active'),
  ('NSCDC', 'Nigeria Security and Civil Defence Corps', 'Critical Infrastructure & Collation Escort', 'CC Olufemi Adeleke', 'Commandant', '+234 805 777 8899', 'DEFENCE-ECHO', '155.200 MHz', 620, 32, 0, 'active'),
  ('DSS', 'Department of State Services (Intelligence Unit)', 'Special Operations Situation Cell', 'Assistant Director K. Musa', 'Assistant Director', '+234 809 333 4455', 'DELTA-SHADOW', 'Secure Satellite Liaison', 180, 20, 4, 'active'),
  ('FRSC', 'Federal Road Safety Corps (Transit Corridor Control)', 'National Arterial Corridors & Checkpoints', 'Corps Commander S. Adamu', 'Corps Commander', '+234 807 666 7788', 'SAFETY-BASE', '138.450 MHz', 340, 55, 0, 'active')
ON CONFLICT DO NOTHING;

-- Seed default Geofenced QRF Rule
INSERT INTO geofenced_qrf_rules (name, min_severity, max_radius_km, auto_dispatch_enabled, alert_agencies, is_active)
VALUES
  ('Ballot Box Interception & Critical PU SOS', 'critical', 12.50, true, '["NPF", "NA", "NSCDC"]'::jsonb, true),
  ('High-Severity Violence & Thuggery Interdict', 'high', 20.00, false, '["NPF", "NSCDC"]'::jsonb, true)
ON CONFLICT DO NOTHING;

COMMIT;
