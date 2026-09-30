-- Migration 022: Phase 2 Election-Specific Operations
-- 1. Operational timeline per PU (standardized milestones + rollup)
-- 2. Results collation mirror & Form EC8A photo evidence with SHA-256 tamper-evident hashing
-- 3. Sensitive materials chain of custody (BVAS, ballot boxes, result sheets)
-- 4. Deployment roster management (strength targets & coverage gaps)
-- 5. Relief & shift management (handover notes & continuous situation log)
-- 6. Logistics request workflow (fuel, vehicles, reinforcement, feeding)
-- 7. Reinforcement / QRF (Quick Reaction Force) dispatch board

BEGIN;

-- 1. Standardized Operational Milestones per Polling Unit
CREATE TABLE IF NOT EXISTS pu_operational_milestones (
  id BIGSERIAL PRIMARY KEY,
  election_id UUID NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
  polling_unit_id INT NOT NULL REFERENCES geo_polling_units(id) ON DELETE CASCADE,
  milestone VARCHAR(32) NOT NULL CHECK (milestone IN (
    'materials_received',
    'polls_opened',
    'accreditation_started',
    'voting_closed',
    'counting_started',
    'results_declared'
  )),
  recorded_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  UNIQUE (election_id, polling_unit_id, milestone)
);

CREATE INDEX IF NOT EXISTS idx_pu_milestones_election_pu ON pu_operational_milestones (election_id, polling_unit_id);
CREATE INDEX IF NOT EXISTS idx_pu_milestones_milestone ON pu_operational_milestones (milestone);

-- 2. Form EC8A Results Collation Mirror & Tamper-Evident Photo Evidence
CREATE TABLE IF NOT EXISTS ec8a_results_evidence (
  id BIGSERIAL PRIMARY KEY,
  election_id UUID NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
  polling_unit_id INT NOT NULL REFERENCES geo_polling_units(id) ON DELETE CASCADE,
  registered_voters INT NOT NULL DEFAULT 0,
  accredited_voters INT NOT NULL DEFAULT 0,
  ballot_papers_issued INT NOT NULL DEFAULT 0,
  ballot_papers_used INT NOT NULL DEFAULT 0,
  ballot_papers_spoiled INT NOT NULL DEFAULT 0,
  ballot_papers_rejected INT NOT NULL DEFAULT 0,
  valid_votes INT NOT NULL DEFAULT 0,
  total_votes_cast INT NOT NULL DEFAULT 0,
  party_votes JSONB NOT NULL DEFAULT '{}'::jsonb,
  photo_url TEXT,
  photo_hash_sha256 VARCHAR(64) NOT NULL,
  photo_captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  photo_source VARCHAR(32) NOT NULL DEFAULT 'police' CHECK (photo_source IN ('police', 'observer', 'party_agent', 'inec_mirror')),
  observer_name TEXT,
  observer_organization TEXT,
  recorded_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  is_verified BOOLEAN NOT NULL DEFAULT false,
  verified_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  anomaly_flags JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (election_id, polling_unit_id, photo_source)
);

CREATE INDEX IF NOT EXISTS idx_ec8a_election_pu ON ec8a_results_evidence (election_id, polling_unit_id);
CREATE INDEX IF NOT EXISTS idx_ec8a_hash ON ec8a_results_evidence (photo_hash_sha256);

-- 3. Sensitive Materials Custody (Chain of Custody)
CREATE TABLE IF NOT EXISTS sensitive_materials_custody (
  id BIGSERIAL PRIMARY KEY,
  election_id UUID NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
  material_type VARCHAR(32) NOT NULL CHECK (material_type IN ('bvas', 'ballot_box', 'ec8a_sheet', 'ballot_papers', 'stamp_and_ink')),
  serial_or_barcode VARCHAR(128) NOT NULL,
  polling_unit_id INT REFERENCES geo_polling_units(id) ON DELETE SET NULL,
  ward_id INT REFERENCES geo_wards(id) ON DELETE SET NULL,
  lga_id INT REFERENCES geo_lgas(id) ON DELETE SET NULL,
  state_id INT REFERENCES geo_states(id) ON DELETE SET NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'in_transit', 'delivered', 'at_pu', 'returned', 'compromised')),
  custody_officer_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
  carrier_name VARCHAR(191),
  carrier_phone VARCHAR(64),
  security_escort TEXT,
  last_scanned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  tamper_seal_intact BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (election_id, serial_or_barcode)
);

CREATE INDEX IF NOT EXISTS idx_sensitive_mat_election ON sensitive_materials_custody (election_id);
CREATE INDEX IF NOT EXISTS idx_sensitive_mat_pu ON sensitive_materials_custody (polling_unit_id);
CREATE INDEX IF NOT EXISTS idx_sensitive_mat_status ON sensitive_materials_custody (status);

CREATE TABLE IF NOT EXISTS sensitive_materials_audit_trail (
  id BIGSERIAL PRIMARY KEY,
  material_id BIGINT NOT NULL REFERENCES sensitive_materials_custody(id) ON DELETE CASCADE,
  action VARCHAR(32) NOT NULL,
  from_officer_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
  to_officer_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  location_name TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mat_audit_material ON sensitive_materials_audit_trail (material_id, created_at DESC);

-- 4. Deployment & Roster Management (Target vs Reported Coverage)
CREATE TABLE IF NOT EXISTS deployment_rosters (
  id BIGSERIAL PRIMARY KEY,
  election_id UUID NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
  polling_unit_id INT NOT NULL REFERENCES geo_polling_units(id) ON DELETE CASCADE,
  target_strength INT NOT NULL DEFAULT 2,
  agency_breakdown JSONB DEFAULT '{"npf": 2, "nscdc": 1}'::jsonb,
  assigned_officer_ids JSONB DEFAULT '[]'::jsonb,
  sector_commander_name TEXT,
  sector_commander_phone VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (election_id, polling_unit_id)
);

CREATE INDEX IF NOT EXISTS idx_deployment_roster_election_pu ON deployment_rosters (election_id, polling_unit_id);

-- 5. Shift Management & Running Situation Handovers
CREATE TABLE IF NOT EXISTS shift_handovers (
  id BIGSERIAL PRIMARY KEY,
  election_id UUID REFERENCES elections(id) ON DELETE CASCADE,
  polling_unit_id INT REFERENCES geo_polling_units(id) ON DELETE SET NULL,
  shift_name VARCHAR(32) NOT NULL CHECK (shift_name IN ('morning', 'afternoon', 'night', 'collation')),
  outgoing_officer_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  incoming_officer_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
  incoming_officer_name VARCHAR(191),
  running_situation_log TEXT NOT NULL,
  materials_status TEXT,
  crowd_assessment VARCHAR(32) DEFAULT 'calm' CHECK (crowd_assessment IN ('calm', 'tense', 'rowdy', 'volatile', 'dispersed')),
  handover_signed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  incoming_acknowledged_at TIMESTAMPTZ,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_shift_handovers_pu ON shift_handovers (polling_unit_id, handover_signed_at DESC);

-- 6. Logistics Request Workflow
CREATE TABLE IF NOT EXISTS logistics_requests (
  id BIGSERIAL PRIMARY KEY,
  election_id UUID REFERENCES elections(id) ON DELETE CASCADE,
  requester_user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  category VARCHAR(32) NOT NULL CHECK (category IN ('fuel', 'vehicle', 'reinforcement', 'feeding', 'comms_battery', 'medical', 'other')),
  priority VARCHAR(16) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'urgent', 'critical')),
  quantity_description TEXT NOT NULL,
  state_id INT REFERENCES geo_states(id) ON DELETE SET NULL,
  lga_id INT REFERENCES geo_lgas(id) ON DELETE SET NULL,
  ward_id INT REFERENCES geo_wards(id) ON DELETE SET NULL,
  polling_unit_id INT REFERENCES geo_polling_units(id) ON DELETE SET NULL,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  status VARCHAR(24) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'dispatched', 'delivered', 'rejected', 'closed')),
  approved_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  assigned_dispatch_unit TEXT,
  command_notes TEXT,
  dispatched_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_logistics_status ON logistics_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logistics_state ON logistics_requests (state_id);

-- 7. Quick Reaction Force (QRF) Units & Dispatches
CREATE TABLE IF NOT EXISTS qrf_tactical_units (
  id BIGSERIAL PRIMARY KEY,
  unit_code VARCHAR(64) UNIQUE NOT NULL,
  unit_name TEXT NOT NULL,
  state_id INT REFERENCES geo_states(id) ON DELETE SET NULL,
  lga_id INT REFERENCES geo_lgas(id) ON DELETE SET NULL,
  base_location TEXT NOT NULL,
  strength_count INT NOT NULL DEFAULT 8,
  commander_name TEXT NOT NULL,
  commander_phone VARCHAR(64) NOT NULL,
  vehicle_callsign TEXT,
  status VARCHAR(24) NOT NULL DEFAULT 'standby' CHECK (status IN ('standby', 'mobilizing', 'deployed', 'on_scene', 'returning', 'offline')),
  current_lat DOUBLE PRECISION,
  current_lng DOUBLE PRECISION,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS qrf_dispatches (
  id BIGSERIAL PRIMARY KEY,
  unit_id BIGINT NOT NULL REFERENCES qrf_tactical_units(id) ON DELETE CASCADE,
  incident_sitrep_id BIGINT REFERENCES command_sitreps(id) ON DELETE SET NULL,
  target_lga_id INT REFERENCES geo_lgas(id) ON DELETE SET NULL,
  target_pu_id INT REFERENCES geo_polling_units(id) ON DELETE SET NULL,
  target_location_name TEXT NOT NULL,
  objective TEXT NOT NULL,
  dispatched_by UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  eta_minutes INT DEFAULT 15,
  status VARCHAR(24) NOT NULL DEFAULT 'dispatched' CHECK (status IN ('dispatched', 'en_route', 'on_scene', 'resolved', 'recalled')),
  dispatched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  arrived_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  after_action_notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_qrf_dispatches_unit ON qrf_dispatches (unit_id, dispatched_at DESC);
CREATE INDEX IF NOT EXISTS idx_qrf_dispatches_status ON qrf_dispatches (status);

-- Seed initial default QRF tactical units for state commands if none exist
INSERT INTO qrf_tactical_units (unit_code, unit_name, base_location, strength_count, commander_name, commander_phone, vehicle_callsign, status)
VALUES
  ('QRF-FCT-01', 'FCT Strike Alpha', 'Force HQ, Abuja', 12, 'SP Ibrahim Garba', '+234 803 111 2233', 'NPF-STRIKE-01', 'standby'),
  ('QRF-LAG-01', 'Lagos Rapid Response Squad (RRS)', 'Alausa Command, Ikeja', 16, 'CSP Adebayo Johnson', '+234 802 334 5566', 'RRS-ALPHA-12', 'standby'),
  ('QRF-RIV-01', 'Rivers Tactical Intervention Unit', 'Port Harcourt Base', 10, 'SP Emeka Okoye', '+234 805 778 9900', 'MOPOL-19-PATROL', 'standby'),
  ('QRF-KAN-01', 'Kano Anti-Thuggery Patrol Squad', 'Bompai Police Command', 14, 'CSP Usman Bello', '+234 803 445 6677', 'NPF-TACTICAL-04', 'standby'),
  ('QRF-KAD-01', 'Kaduna Security Special Task Force', 'Kaduna Area Command', 12, 'SP Danladi Musa', '+234 806 223 3445', 'NPF-QRF-08', 'standby')
ON CONFLICT (unit_code) DO NOTHING;

COMMIT;
