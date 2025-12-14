-- Add created_by field to track group creator (admin)
ALTER TABLE groups ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);

-- Backfill existing groups: Set creator to first member (best effort)
-- This will set the first member found as the creator for existing groups
UPDATE groups g
SET created_by = (
    SELECT f.linked_user_id 
    FROM group_members gm 
    JOIN friends f ON gm.friend_id = f.id 
    WHERE gm.group_id = g.id AND f.linked_user_id IS NOT NULL 
    LIMIT 1
)
WHERE created_by IS NULL;
