-- Field officers: optional PU assignment (admin-set) for jurisdiction context in the Field Portal
BEGIN;

ALTER TABLE officer_profiles
  ADD COLUMN IF NOT EXISTS assigned_polling_unit_id INT REFERENCES geo_polling_units (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_officer_profiles_assigned_pu ON officer_profiles (assigned_polling_unit_id);

COMMIT;
