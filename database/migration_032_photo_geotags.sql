-- migration_032_photo_geotags.sql
-- Geotag evidence photos sent from field devices: where and when the photo
-- was captured, separate from the report's incident location.

ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS photo_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS photo_lng DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS photo_accuracy DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS photo_captured_at TIMESTAMPTZ;

ALTER TABLE field_capture_outbox
  ADD COLUMN IF NOT EXISTS photo_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS photo_lng DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS photo_accuracy DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS photo_captured_at TIMESTAMPTZ;
