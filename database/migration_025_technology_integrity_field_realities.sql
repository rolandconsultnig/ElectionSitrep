-- Migration 025: Phase 5 Technology, Integrity & Field Realities
-- 1. Offline sync conflict resolution & outbox queue telemetry
-- 2. Device biometric telemetry & battery / signal monitoring
-- 3. Low-bandwidth SMS & USSD fallback ingestion bridge
-- 4. Cryptographic immutable block audit ledger with SHA-256 verification

BEGIN;

-- 1. Offline Sync Conflict Resolution Records
CREATE TABLE IF NOT EXISTS offline_conflict_resolutions (
  id BIGSERIAL PRIMARY KEY,
  client_id VARCHAR(64) NOT NULL,
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  entity_type VARCHAR(32) NOT NULL CHECK (entity_type IN ('sitrep', 'vote_tally', 'milestone', 'material_custody')),
  server_payload JSONB NOT NULL,
  client_payload JSONB NOT NULL,
  resolution_strategy VARCHAR(24) NOT NULL DEFAULT 'server_wins' CHECK (resolution_strategy IN ('server_wins', 'client_wins', 'manual_merged')),
  resolved_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_offline_conflicts_user ON offline_conflict_resolutions (user_id);
CREATE INDEX IF NOT EXISTS idx_offline_conflicts_client_id ON offline_conflict_resolutions (client_id);

-- 2. Officer Device Telemetry & Biometrics Health
CREATE TABLE IF NOT EXISTS officer_device_telemetry (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  device_id VARCHAR(128) NOT NULL,
  battery_level INT NOT NULL DEFAULT 100,
  battery_is_charging BOOLEAN NOT NULL DEFAULT false,
  network_type VARCHAR(16) NOT NULL DEFAULT '4G' CHECK (network_type IN ('5G', '4G', '3G', '2G', 'OFFLINE')),
  signal_strength_dbm INT DEFAULT -75,
  gps_lat NUMERIC(10, 7),
  gps_lng NUMERIC(10, 7),
  gps_accuracy_meters NUMERIC(6, 2) DEFAULT 5.0,
  app_version VARCHAR(32) DEFAULT '2.4.0',
  biometric_liveness_score NUMERIC(4, 3) DEFAULT 0.995,
  mock_location_detected BOOLEAN NOT NULL DEFAULT false,
  last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_user_device_telemetry UNIQUE (user_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_device_telemetry_user ON officer_device_telemetry (user_id);
CREATE INDEX IF NOT EXISTS idx_device_telemetry_heartbeat ON officer_device_telemetry (last_heartbeat DESC);

-- 3. Low-Bandwidth SMS & USSD Fallback Inbound Queue
CREATE TABLE IF NOT EXISTS sms_ussd_inbound_queue (
  id BIGSERIAL PRIMARY KEY,
  election_id UUID REFERENCES elections(id) ON DELETE CASCADE,
  sender_phone VARCHAR(64) NOT NULL,
  channel VARCHAR(16) NOT NULL DEFAULT 'SMS' CHECK (channel IN ('SMS', 'USSD', 'RADIO_PACKET')),
  raw_message TEXT NOT NULL,
  parsed_command VARCHAR(32),
  parsed_pu_code VARCHAR(64),
  parsed_payload JSONB DEFAULT '{}'::jsonb,
  parsing_status VARCHAR(24) NOT NULL DEFAULT 'parsed' CHECK (parsing_status IN ('pending', 'parsed', 'malformed', 'processed', 'rejected')),
  error_notes TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sms_inbound_status ON sms_ussd_inbound_queue (parsing_status);
CREATE INDEX IF NOT EXISTS idx_sms_inbound_phone ON sms_ussd_inbound_queue (sender_phone);

-- 4. Cryptographic Blockchain-Style Immutable Audit Ledger
CREATE TABLE IF NOT EXISTS cryptographic_audit_ledger (
  block_index BIGSERIAL PRIMARY KEY,
  previous_block_hash VARCHAR(64) NOT NULL,
  current_block_hash VARCHAR(64) NOT NULL UNIQUE,
  event_type VARCHAR(48) NOT NULL,
  actor_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
  actor_username VARCHAR(128),
  actor_role VARCHAR(48),
  payload_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  tamper_seal_valid BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_ledger_hash ON cryptographic_audit_ledger (current_block_hash);
CREATE INDEX IF NOT EXISTS idx_audit_ledger_event ON cryptographic_audit_ledger (event_type);

-- Seed Genesis Block for Audit Ledger
INSERT INTO cryptographic_audit_ledger (block_index, previous_block_hash, current_block_hash, event_type, actor_username, actor_role, payload_summary, tamper_seal_valid, created_at)
VALUES (
  1,
  '0000000000000000000000000000000000000000000000000000000000000000',
  '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945',
  'GENESIS_BLOCK_INITIALIZATION',
  'SYSTEM_INITIALIZER',
  'NATIONAL_ROOT',
  '{"system": "Nigeria Police Force Election SitRep Platform", "version": "2.4.0-CRYPTO", "doctrine": "Zero-Trust Forensic Integrity"}'::jsonb,
  true,
  now()
) ON CONFLICT DO NOTHING;

-- Seed default initial SMS fallback messages
INSERT INTO sms_ussd_inbound_queue (sender_phone, channel, raw_message, parsed_command, parsed_pu_code, parsed_payload, parsing_status, created_at)
VALUES
  ('+2348039991122', 'SMS', 'SITREP 14/02/01/005 PEACEFUL 250 ACCREDITED 210 VOTED', 'SITREP', '14/02/01/005', '{"status": "peaceful", "accredited": 250, "voted": 210}'::jsonb, 'processed', now() - interval '20 minutes'),
  ('+2348023334455', 'SMS', 'SOS 14/02/01/008 THUGGERY_SNATCH 4 ARMED HOODLUMS RAC CENTER', 'SOS', '14/02/01/008', '{"incident": "thuggery_snatch", "urgency": "critical"}'::jsonb, 'processed', now() - interval '8 minutes'),
  ('+2348095556677', 'USSD', '*999*PU*14/02/01/012*VOTES*APC=180*PDP=142*LP=95#', 'VOTE_TALLY', '14/02/01/012', '{"APC": 180, "PDP": 142, "LP": 95}'::jsonb, 'processed', now() - interval '2 minutes')
ON CONFLICT DO NOTHING;

COMMIT;
