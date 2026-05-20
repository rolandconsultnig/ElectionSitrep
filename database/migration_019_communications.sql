BEGIN;

-- Create chat_messages table
CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    room_id VARCHAR(50) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_room_id ON chat_messages(room_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at);

-- Add photo_data to field_capture_outbox
ALTER TABLE field_capture_outbox ADD COLUMN IF NOT EXISTS photo_data BYTEA;
ALTER TABLE field_capture_outbox ADD COLUMN IF NOT EXISTS photo_mime VARCHAR(128);

COMMIT;
