-- Migration 023: Phase 3 Political & Situational Awareness
-- 1. Political party / agent incident attribution (partisan pattern analysis)
-- 2. Observer & stakeholder registry (international/domestic observers, media, CSOs)
-- 3. Post-election scenario planning & playbooks (runoffs, inconclusive, crowd control)
-- 4. Election petition tribunal evidence export bundles with cryptographic integrity chain

BEGIN;

-- 1. Political Party / Agent Incident Attribution
CREATE TABLE IF NOT EXISTS party_incident_attributions (
  id BIGSERIAL PRIMARY KEY,
  incident_sitrep_id BIGINT REFERENCES command_sitreps(id) ON DELETE CASCADE,
  election_id UUID REFERENCES elections(id) ON DELETE CASCADE,
  party_id UUID REFERENCES political_parties(id) ON DELETE CASCADE,
  role VARCHAR(24) NOT NULL CHECK (role IN ('accused', 'complainant', 'victim', 'witness', 'mediator')),
  agent_name TEXT,
  agent_phone VARCHAR(64),
  agent_party_role VARCHAR(64) DEFAULT 'Polling Agent',
  allegation_details TEXT NOT NULL,
  evidence_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_party_attributions_party ON party_incident_attributions (party_id);
CREATE INDEX IF NOT EXISTS idx_party_attributions_incident ON party_incident_attributions (incident_sitrep_id);
CREATE INDEX IF NOT EXISTS idx_party_attributions_role ON party_incident_attributions (role);

-- 2. Observer & Stakeholder Registry
CREATE TABLE IF NOT EXISTS accredited_stakeholders (
  id BIGSERIAL PRIMARY KEY,
  election_id UUID REFERENCES elections(id) ON DELETE CASCADE,
  category VARCHAR(32) NOT NULL CHECK (category IN (
    'domestic_observer',
    'international_observer',
    'media_press',
    'cso_ngo',
    'inec_monitor',
    'diplomatic_mission'
  )),
  organization_name TEXT NOT NULL,
  lead_contact_name TEXT NOT NULL,
  contact_phone VARCHAR(64) NOT NULL,
  contact_email VARCHAR(128),
  accreditation_number VARCHAR(64) UNIQUE NOT NULL,
  state_id INT REFERENCES geo_states(id) ON DELETE SET NULL,
  assigned_lga_ids JSONB DEFAULT '[]'::jsonb,
  vehicle_plate_numbers TEXT,
  security_escort_provided BOOLEAN NOT NULL DEFAULT false,
  incident_access_level VARCHAR(24) NOT NULL DEFAULT 'public_verified' CHECK (incident_access_level IN ('restricted', 'public_verified', 'liaison_shared', 'full_partner')),
  status VARCHAR(24) NOT NULL DEFAULT 'accredited' CHECK (status IN ('accredited', 'in_field', 'flagged', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stakeholders_category ON accredited_stakeholders (category);
CREATE INDEX IF NOT EXISTS idx_stakeholders_state ON accredited_stakeholders (state_id);
CREATE INDEX IF NOT EXISTS idx_stakeholders_status ON accredited_stakeholders (status);

-- 3. Scenario Planning Playbooks & Live Activations
CREATE TABLE IF NOT EXISTS scenario_playbooks (
  id BIGSERIAL PRIMARY KEY,
  slug VARCHAR(64) UNIQUE NOT NULL,
  title TEXT NOT NULL,
  scenario_type VARCHAR(32) NOT NULL CHECK (scenario_type IN ('runoff', 'inconclusive', 'supplementary', 'crowd_control', 'curfew', 'tribunal_security')),
  trigger_conditions TEXT NOT NULL,
  security_doctrine TEXT NOT NULL,
  force_disposition_matrix JSONB NOT NULL DEFAULT '[]'::jsonb,
  rules_of_engagement TEXT NOT NULL,
  communication_channels TEXT NOT NULL,
  checklist_steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scenario_activations (
  id BIGSERIAL PRIMARY KEY,
  playbook_id BIGINT NOT NULL REFERENCES scenario_playbooks(id) ON DELETE CASCADE,
  election_id UUID REFERENCES elections(id) ON DELETE CASCADE,
  state_id INT REFERENCES geo_states(id) ON DELETE SET NULL,
  lga_id INT REFERENCES geo_lgas(id) ON DELETE SET NULL,
  activated_by UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  status VARCHAR(24) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'monitoring', 'deescalated', 'closed')),
  activation_rationale TEXT NOT NULL,
  active_checkpoints_count INT NOT NULL DEFAULT 0,
  completed_steps JSONB DEFAULT '[]'::jsonb,
  activated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_scenario_activations_playbook ON scenario_activations (playbook_id);
CREATE INDEX IF NOT EXISTS idx_scenario_activations_status ON scenario_activations (status);

-- 4. Election Petition Tribunal Evidence Export Bundles
CREATE TABLE IF NOT EXISTS tribunal_evidence_bundles (
  id BIGSERIAL PRIMARY KEY,
  bundle_code VARCHAR(64) UNIQUE NOT NULL,
  election_id UUID NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
  polling_unit_id INT REFERENCES geo_polling_units(id) ON DELETE SET NULL,
  lga_id INT REFERENCES geo_lgas(id) ON DELETE SET NULL,
  state_id INT REFERENCES geo_states(id) ON DELETE SET NULL,
  case_title TEXT NOT NULL,
  petitioner_party TEXT,
  respondent_party TEXT,
  compiled_by UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  integrity_hash_sha256 VARCHAR(64) NOT NULL,
  bundle_manifest JSONB NOT NULL DEFAULT '{}'::jsonb,
  pdf_report_url TEXT,
  certified_affidavit_signed BOOLEAN NOT NULL DEFAULT true,
  status VARCHAR(24) NOT NULL DEFAULT 'ready_for_court' CHECK (status IN ('draft', 'certified', 'ready_for_court', 'tendered_in_tribunal')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tribunal_bundles_election ON tribunal_evidence_bundles (election_id);
CREATE INDEX IF NOT EXISTS idx_tribunal_bundles_pu ON tribunal_evidence_bundles (polling_unit_id);
CREATE INDEX IF NOT EXISTS idx_tribunal_bundles_hash ON tribunal_evidence_bundles (integrity_hash_sha256);

-- Seed pre-built default scenario playbooks
INSERT INTO scenario_playbooks (slug, title, scenario_type, trigger_conditions, security_doctrine, force_disposition_matrix, rules_of_engagement, communication_channels, checklist_steps)
VALUES
  (
    'runoff-election-doctrine',
    'Presidential / Gubernatorial Runoff Scenario Playbook',
    'runoff',
    'No candidate meets the 25% threshold in 2/3 of states or clear constitutional majority',
    'Maximum saturation of critical transit corridors and strict cordon around designated runoff polling centers.',
    '[{"sector": "Core Metro Areas", "units": 4, "type": "MOPOL Strike Force"}, {"sector": "LGA Collation Hubs", "units": 2, "type": "Armed Tactical Escort"}]'::jsonb,
    'Non-lethal crowd dispersal; strict verification of INEC credentials before access to collation centers.',
    'Command Channel Alpha & Encrypted Situation Room VHF',
    '["Notify all Area Commands within 2 hours of INEC declaration", "Enforce 500m security buffer around collation centers", "Dispatch armored personnel carriers to hotspot boundary junctions", "Deploy Joint Security Patrols with NSCDC and Military Quick Reaction Groups"]'::jsonb
  ),
  (
    'inconclusive-supplementary-poll',
    'Inconclusive Polls & Supplementary Voting Protocol',
    'supplementary',
    'Margin of lead is lower than total registered/accredited voters in cancelled polling stations (Section 24/51 Electoral Act)',
    'Fortified sterile perimeter around the specific supplementary polling units with zero vehicular movement within 300m.',
    '[{"sector": "Target Wards", "units": 6, "type": "Joint Tactical Taskforce"}]'::jsonb,
    'Strict anti-thuggery interdiction; immediate apprehension of unauthorized party convoys.',
    'Tactical Channel Echo (State Command Frequency)',
    '["Conduct physical reconnaissance of cancelled PUs", "Establish static checkpoints on entry routes into supplementary wards", "Assign dedicated armed escort to each BVAS transport team", "Direct live video surveillance feeds to State Situation Room"]'::jsonb
  ),
  (
    'result-declaration-crowd-control',
    'Collation Center & Declaration Crowd Control Playbook',
    'crowd_control',
    'Impending announcement of final election winner with high probability of mass jubilations or partisan unrest',
    'Layered inner, middle, and outer defensive perimeters with rapid de-escalation barriers and water cannons on standby.',
    '[{"sector": "Inner Collation Hall", "units": 2, "type": "Close Protection Detachment"}, {"sector": "State HQ Perimeter", "units": 8, "type": "Crowd Dispersal Squads"}]'::jsonb,
    'Proportional force; defensive perimeter maintenance; zero firearms discharge near civilian gatherings.',
    'Liaison Tactical Frequency & Situation Room PA System',
    '["Lock down 1km vehicular perimeter around National/State Collation Center", "Deploy anti-riot mobile units with public address systems", "Coordinate with local transport unions to divert civilian traffic", "Activate rapid detention buses for aggressive agitators"]'::jsonb
  )
ON CONFLICT (slug) DO NOTHING;

-- Seed default initial accredited stakeholders (Observers and Media)
INSERT INTO accredited_stakeholders (category, organization_name, lead_contact_name, contact_phone, contact_email, accreditation_number, incident_access_level, status)
VALUES
  ('domestic_observer', 'YIAGA Africa (Watching The Vote)', 'Samson Itodo', '+234 803 999 1122', 'sitodo@yiaga.org', 'INEC/OBS/2026/001', 'full_partner', 'in_field'),
  ('international_observer', 'European Union Election Observation Mission (EU EOM)', 'Maria Gonzalez', '+234 812 345 6789', 'eueom-nigeria@eeas.europa.eu', 'INEC/OBS/2026/042', 'liaison_shared', 'in_field'),
  ('domestic_observer', 'Centre for Democracy and Development (CDD West Africa)', 'Idayat Hassan', '+234 802 111 4455', 'director@cddwestafrica.org', 'INEC/OBS/2026/009', 'liaison_shared', 'in_field'),
  ('media_press', 'Channels Television Live Ops Unit', 'Adebayo Smith', '+234 805 667 8899', 'electiondesk@channelstv.com', 'INEC/MED/2026/104', 'public_verified', 'in_field'),
  ('international_observer', 'The Carter Center Election Observer Team', 'Dr. David Anderson', '+234 809 123 4567', 'nigeria2026@cartercenter.org', 'INEC/OBS/2026/018', 'liaison_shared', 'in_field')
ON CONFLICT (accreditation_number) DO NOTHING;

COMMIT;
