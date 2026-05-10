BEGIN;

-- Issued accounts belong to a batch (nullable for manually seeded users)
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS source_batch_id UUID REFERENCES credential_batches (id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS app_users_username_lower_idx ON app_users (LOWER(username));

COMMIT;
