-- Native mobile / offline sync: durable capture for SitRep, incidents, violence (votes use election_pu_party_votes via sync API)
BEGIN;

CREATE TABLE IF NOT EXISTS field_capture_outbox (
  id BIGSERIAL PRIMARY KEY,
  client_id VARCHAR(64) NOT NULL,
  user_id UUID NOT NULL REFERENCES app_users (id) ON DELETE CASCADE,
  kind VARCHAR(32) NOT NULL CHECK (kind IN ('sitrep', 'incident', 'violence')),
  payload JSONB NOT NULL,
  device_created_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_field_capture_user_received ON field_capture_outbox (user_id, received_at DESC);

COMMIT;
