BEGIN;

-- Canonical DM room ids are dm_<userId>_<userId> (UUID pair), which exceeds 50 chars.
ALTER TABLE chat_messages ALTER COLUMN room_id TYPE VARCHAR(191);

COMMIT;
