BEGIN;

CREATE TABLE IF NOT EXISTS police_offices (
  id SERIAL PRIMARY KEY,
  level VARCHAR(16) NOT NULL
    CHECK (level IN ('force_hq', 'zonal', 'state', 'division', 'station')),
  name TEXT NOT NULL,
  code VARCHAR(32) UNIQUE,
  parent_id INTEGER REFERENCES police_offices (id) ON DELETE RESTRICT,
  state_id INTEGER REFERENCES geo_states (id) ON DELETE SET NULL,
  address TEXT,
  office_phone VARCHAR(64),
  office_email VARCHAR(128),
  oic_rank VARCHAR(64),
  oic_name TEXT,
  oic_phone VARCHAR(64),
  oic_email VARCHAR(128),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES app_users (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_police_offices_parent ON police_offices (parent_id);
CREATE INDEX IF NOT EXISTS idx_police_offices_level ON police_offices (level);
CREATE UNIQUE INDEX IF NOT EXISTS idx_police_offices_single_force_hq
  ON police_offices (level) WHERE level = 'force_hq';

INSERT INTO police_offices (level, name, code, address)
VALUES ('force_hq', 'Force Headquarters', 'FHQ', 'Louis Edet House, Shehu Shagari Way, Area 11, Garki, Abuja')
ON CONFLICT (code) DO NOTHING;

COMMIT;
