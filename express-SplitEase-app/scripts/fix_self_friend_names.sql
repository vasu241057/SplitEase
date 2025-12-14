-- SQL Script to fix existing self-friend records with name 'You'
-- Run this in Supabase SQL Editor to update existing self-friend records
-- to use the user's actual profile name.

-- This updates friends where:
-- 1. The name is literally 'You'
-- 2. The owner_id equals linked_user_id (self-friend)
-- 3. The linked user has a profile with a full_name

UPDATE friends
SET name = profiles.full_name
FROM profiles
WHERE friends.linked_user_id = profiles.id
  AND friends.owner_id = friends.linked_user_id  -- Self-friend condition
  AND friends.name = 'You'  -- Only fix records with literal 'You'
  AND profiles.full_name IS NOT NULL
  AND profiles.full_name != '';

-- Show what was updated (optional - run after the UPDATE)
-- SELECT f.id, f.name, f.linked_user_id, p.full_name 
-- FROM friends f 
-- JOIN profiles p ON f.linked_user_id = p.id 
-- WHERE f.owner_id = f.linked_user_id;
