-- Add simplified_debts column to groups table
ALTER TABLE groups 
ADD COLUMN IF NOT EXISTS simplified_debts JSONB DEFAULT '[]'::jsonb;
