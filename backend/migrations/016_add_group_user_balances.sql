-- Add user_balances column to groups table to store per-user net balances
ALTER TABLE groups ADD COLUMN IF NOT EXISTS user_balances JSONB DEFAULT '{}'::jsonb;
