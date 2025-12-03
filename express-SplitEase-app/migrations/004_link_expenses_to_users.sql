-- Link expenses to auth.users for global filtering
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS payer_user_id uuid REFERENCES auth.users(id);
ALTER TABLE expense_splits ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);

-- Backfill data using linked_user_id from friends table
UPDATE expenses 
SET payer_user_id = (SELECT linked_user_id FROM friends WHERE id = expenses.payer_id)
WHERE payer_id IS NOT NULL AND payer_user_id IS NULL;

UPDATE expense_splits
SET user_id = (SELECT linked_user_id FROM friends WHERE id = expense_splits.friend_id)
WHERE friend_id IS NOT NULL AND user_id IS NULL;

-- Create RPC for filtering expenses
CREATE OR REPLACE FUNCTION get_user_expenses(current_user_id uuid)
RETURNS SETOF expenses
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT DISTINCT e.*
  FROM expenses e
  LEFT JOIN expense_splits es ON e.id = es.expense_id
  LEFT JOIN friends f_payer ON e.payer_id = f_payer.id
  LEFT JOIN friends f_split ON es.friend_id = f_split.id
  WHERE 
    -- 1. I am the global payer
    e.payer_user_id = current_user_id
    -- 2. I am a global splitter
    OR es.user_id = current_user_id
    -- 3. I own the local friend who paid
    OR f_payer.owner_id = current_user_id
    -- 4. I own the local friend who is in splits
    OR f_split.owner_id = current_user_id
  ORDER BY e.date DESC;
$$;
