-- Fix get_user_expenses to include group membership check
-- This adds a 5th condition: If the expense belongs to a group I am a member of

CREATE OR REPLACE FUNCTION get_user_expenses(current_user_id uuid)
RETURNS SETOF expenses
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
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
    -- 5. NEW: I am a member of the group this expense belongs to
    OR e.group_id IN (
      SELECT gm.group_id 
      FROM group_members gm 
      JOIN friends f ON gm.friend_id = f.id 
      WHERE f.linked_user_id = current_user_id
    )
  ORDER BY e.date DESC;
$$;
