ALTER TABLE transactions ADD COLUMN group_id UUID REFERENCES groups(id);
