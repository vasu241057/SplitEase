
-- 005_add_deleted_to_transactions.sql
-- Add deleted column to transactions table to support soft delete
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS deleted BOOLEAN DEFAULT false;
