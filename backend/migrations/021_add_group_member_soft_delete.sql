-- Migration: Add soft-delete columns to group_members
-- Purpose: Enable tracking of former group members for historical expense replay
-- Never hard-delete group_members - use is_active = false instead

-- Add columns
ALTER TABLE group_members 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS left_at TIMESTAMPTZ DEFAULT null;

-- Backfill: all existing rows are active
UPDATE group_members SET is_active = true WHERE is_active IS NULL;

-- Add index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_group_members_is_active 
ON group_members(group_id, is_active);
