-- SQL Script to reset Expenses and Groups
-- Run this in Supabase SQL Editor to wipe financial history while keeping friends.

BEGIN;

-- 1. Remove optional dependencies
DELETE FROM comments;

-- 2. Remove dependencies on expenses
DELETE FROM expense_splits;

-- 3. Remove main financial records
-- Note: 'transactions' might reference groups/friends. 
-- Valid to delete all checks/payments since we are resetting history.
DELETE FROM transactions;

-- 4. Remove expenses (references groups)
DELETE FROM expenses;

-- 5. Remove group memberships (references groups)
DELETE FROM group_members;

-- 6. Remove groups
DELETE FROM groups;

-- 7. Reset all friend balances to 0
UPDATE friends SET balance = 0;

COMMIT;
