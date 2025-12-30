-- 014_add_simplify_debts_enabled.sql
ALTER TABLE groups
ADD COLUMN simplify_debts_enabled BOOLEAN DEFAULT NULL;
