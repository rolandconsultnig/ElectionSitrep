-- Nationwide scope for governorship / LG contests when no single state is chosen
BEGIN;

ALTER TABLE elections
  ADD COLUMN IF NOT EXISTS governorship_all_states BOOLEAN NOT NULL DEFAULT false;

COMMIT;
