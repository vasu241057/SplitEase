-- Add created_by to transactions to track who initiated the settle-up
-- This is critical for correct fromId/toId derivation
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);

-- Backfill existing transactions using friend's owner_id as best guess
UPDATE transactions t
SET created_by = f.owner_id
FROM friends f
WHERE t.friend_id = f.id AND t.created_by IS NULL;
