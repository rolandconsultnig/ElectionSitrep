-- Voice SitRep: audio note attachments on field_capture_outbox (mirrors photo_data/photo_mime from migration_019)
BEGIN;

ALTER TABLE field_capture_outbox ADD COLUMN IF NOT EXISTS audio_data BYTEA;
ALTER TABLE field_capture_outbox ADD COLUMN IF NOT EXISTS audio_mime VARCHAR(64);

COMMIT;
