-- Add unique constraint to friends table to enable safe upserts
-- This prevents the 42P10 "missing constraint" error in recalculate.ts

CREATE UNIQUE INDEX IF NOT EXISTS friends_owner_linked_idx 
ON friends (owner_id, linked_user_id);
