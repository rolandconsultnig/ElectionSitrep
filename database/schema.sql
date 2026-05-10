-- Election SitRep — baseline PostgreSQL schema (PostgreSQL 13+)
-- Apply: psql -U postgres -d election_db -f schema.sql

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Political parties (INEC register)
CREATE TABLE IF NOT EXISTS political_parties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inec_register_code VARCHAR(32) UNIQUE NOT NULL,
  name TEXT NOT NULL,
  abbreviation VARCHAR(16) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'active'
    CHECK (status IN ('under_review', 'active', 'suspended')),
  logo_url TEXT,
  logo_mime VARCHAR(128),
  logo_image BYTEA,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_political_parties_abbr ON political_parties (abbreviation);

-- Application accounts (issued credentials + provisioned users)
CREATE TABLE IF NOT EXISTS app_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(191) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  portal VARCHAR(20) NOT NULL
    CHECK (portal IN ('admin', 'field', 'management', 'igp')),
  onboarding_complete BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_users_portal ON app_users (portal);

-- First-time profile after login (officer identity + verified capture metadata)
CREATE TABLE IF NOT EXISTS officer_profiles (
  user_id UUID PRIMARY KEY REFERENCES app_users (id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  service_number VARCHAR(128) NOT NULL,
  phone VARCHAR(64) NOT NULL,
  picture_data BYTEA,
  picture_content_type VARCHAR(128),
  liveness_verified BOOLEAN NOT NULL DEFAULT false,
  liveness_checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Admin-generated credential batches (distribution lists)
CREATE TABLE IF NOT EXISTS credential_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_key VARCHAR(128) UNIQUE NOT NULL,
  portal VARCHAR(20) NOT NULL
    CHECK (portal IN ('admin', 'field', 'management', 'igp')),
  rank_label TEXT,
  role_label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credential_batches_created ON credential_batches (created_at DESC);

CREATE TABLE IF NOT EXISTS issued_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES credential_batches (id) ON DELETE CASCADE,
  username VARCHAR(191) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_issued_credentials_batch ON issued_credentials (batch_id);

-- Immutable-style audit trail (append-only)
CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  entity_type VARCHAR(64) NOT NULL,
  entity_id TEXT,
  action VARCHAR(64) NOT NULL,
  payload JSONB,
  actor_user_id UUID REFERENCES app_users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log (entity_type, entity_id);

COMMIT;
