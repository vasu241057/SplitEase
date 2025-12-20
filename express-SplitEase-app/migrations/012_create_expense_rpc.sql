-- Function to atomically create an expense and its splits
-- Usage: supabase.rpc('create_expense_with_splits', { ...params... })

CREATE OR REPLACE FUNCTION create_expense_with_splits(
  p_description TEXT,
  p_amount NUMERIC,
  p_date TIMESTAMPTZ,
  p_payer_id UUID,        -- Nullable
  p_payer_user_id UUID,   -- Nullable
  p_group_id UUID,        -- Nullable
  p_created_by UUID,
  p_splits JSONB          -- Array of objects: { user_id, friend_id, amount, paid_amount, paid }
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_expense_id UUID;
  v_expense_record JSONB;
BEGIN
  -- 1. Insert Expense
  INSERT INTO expenses (description, amount, date, payer_id, payer_user_id, group_id, created_by, deleted)
  VALUES (p_description, p_amount, p_date, p_payer_id, p_payer_user_id, p_group_id, p_created_by, false)
  RETURNING id INTO v_expense_id;

  -- 2. Insert Splits
  INSERT INTO expense_splits (expense_id, user_id, friend_id, amount, paid_amount, paid)
  SELECT
    v_expense_id,
    CASE WHEN (x->>'user_id') IS NULL THEN NULL ELSE (x->>'user_id')::UUID END,
    CASE WHEN (x->>'friend_id') IS NULL THEN NULL ELSE (x->>'friend_id')::UUID END,
    (x->>'amount')::NUMERIC,
    COALESCE((x->>'paid_amount')::NUMERIC, 0),
    COALESCE((x->>'paid')::BOOLEAN, false)
  FROM jsonb_array_elements(p_splits) t(x);

  -- Return the created expense as JSON
  SELECT to_jsonb(e) INTO v_expense_record FROM expenses e WHERE id = v_expense_id;
  RETURN v_expense_record;
EXCEPTION WHEN OTHERS THEN
  -- Raise exception to rollback transaction
  RAISE;
END;
$$;
