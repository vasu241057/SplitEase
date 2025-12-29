-- Add split_mode column to expenses table
ALTER TABLE expenses
ADD COLUMN split_mode text CHECK (split_mode IN ('equally', 'unequally', 'percentage'));

-- Create atomic update RPC function
CREATE OR REPLACE FUNCTION update_expense_with_splits(
  p_expense_id uuid,
  p_description text,
  p_amount numeric,
  p_date timestamptz,
  p_payer_id uuid, -- Local friend ID (nullable)
  p_payer_user_id uuid, -- Global user ID (nullable)
  p_group_id uuid,
  p_split_mode text,
  p_splits jsonb -- Array of split objects
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  split_record jsonb;
BEGIN
  -- 1. Update Expense
  UPDATE expenses
  SET
    description = p_description,
    amount = p_amount,
    date = p_date,
    payer_id = p_payer_id,
    payer_user_id = p_payer_user_id,
    group_id = p_group_id,
    split_mode = p_split_mode
  WHERE id = p_expense_id;

  -- 2. Delete existing splits
  DELETE FROM expense_splits
  WHERE expense_id = p_expense_id;

  -- 3. Insert new splits
  FOR split_record IN SELECT * FROM jsonb_array_elements(p_splits)
  LOOP
    INSERT INTO expense_splits (
      expense_id,
      user_id,
      friend_id,
      amount,
      paid_amount,
      paid
    )
    VALUES (
      p_expense_id,
      (split_record->>'user_id')::uuid,
      (split_record->>'friend_id')::uuid,
      (split_record->>'amount')::numeric,
      (split_record->>'paid_amount')::numeric,
      (split_record->>'paid')::boolean
    );
  END LOOP;

END;
$$;
