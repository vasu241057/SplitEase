-- Add is_implicit flag to identify auto-created friends
ALTER TABLE friends 
ADD COLUMN IF NOT EXISTS is_implicit BOOLEAN DEFAULT FALSE;

-- Optional: Index for filtering if needed later
CREATE INDEX IF NOT EXISTS idx_friends_is_implicit ON friends(is_implicit);
