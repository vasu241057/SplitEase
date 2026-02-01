-- Add created_by to expenses to track who added the expense
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);

-- Backfill existing expenses: assume the payer created the expense if unknown
UPDATE expenses
SET created_by = payer_user_id
WHERE created_by IS NULL AND payer_user_id IS NOT NULL;
