-- migration_033_officer_attendance.sql
-- Duty clock-in: officer confirms arrival at their assigned polling unit.
-- One row per clock-in; distance from the assigned PU is computed server-side
-- so client-reported coordinates can't fake "at post".

CREATE TABLE IF NOT EXISTS officer_attendance (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  clocked_in_at TIMESTAMPTZ NOT NULL DEFAULT now(),   -- server receipt time
  device_recorded_at TIMESTAMPTZ,                     -- when the officer tapped (offline-safe)
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  accuracy DOUBLE PRECISION,
  pu_id BIGINT REFERENCES geo_polling_units(id),
  pu_code TEXT,
  distance_m DOUBLE PRECISION,
  gps_verified BOOLEAN NOT NULL DEFAULT false,        -- within 100 m of assigned PU
  network TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS officer_attendance_user_idx
  ON officer_attendance (user_id, clocked_in_at DESC);
