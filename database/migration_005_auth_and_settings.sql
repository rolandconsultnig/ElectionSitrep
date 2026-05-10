-- Auth: password change policy, service number login, system settings
BEGIN;

ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS password_must_change BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO system_settings (key, value) VALUES
  ('detection', '{"anomalySigma":3,"ocrMismatchPct":5}'::jsonb),
  ('notifications', '{"smsGateway":"africas_talking","broadcastLangs":["en","ha","yo","ig"]}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- One profile per service number (for login by service number after onboarding)
CREATE UNIQUE INDEX IF NOT EXISTS idx_officer_profiles_service_number_login
  ON officer_profiles (LOWER(TRIM(service_number)))
  WHERE LENGTH(TRIM(service_number)) > 0;

COMMIT;
