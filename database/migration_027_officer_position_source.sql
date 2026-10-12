BEGIN;

ALTER TABLE officer_safety
  ADD COLUMN IF NOT EXISTS position_source VARCHAR(16);

UPDATE officer_safety
SET position_source = 'checkin'
WHERE position_source IS NULL AND last_lat IS NOT NULL AND last_lng IS NOT NULL;

COMMIT;
