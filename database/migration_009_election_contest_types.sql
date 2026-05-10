-- Multiple simultaneous contest types per election (e.g. Presidential + Senatorial + HoR)
BEGIN;

ALTER TABLE elections
  ADD COLUMN IF NOT EXISTS election_contest_types JSONB NOT NULL DEFAULT '["other"]'::jsonb;

UPDATE elections
SET election_contest_types = jsonb_build_array(election_category)
WHERE election_category IS NOT NULL;

COMMIT;
