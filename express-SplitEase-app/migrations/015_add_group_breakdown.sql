-- Add group_breakdown column to friends table for storing pre-calculated balance buckets
ALTER TABLE friends ADD COLUMN IF NOT EXISTS group_breakdown JSONB DEFAULT '[]'::jsonb;
