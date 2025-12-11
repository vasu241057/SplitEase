-- Migration number: 006 	 2024-12-11T14:45:00.000Z
CREATE TABLE IF NOT EXISTS comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type VARCHAR(20) NOT NULL, -- 'expense' or 'payment'
    entity_id UUID NOT NULL,
    user_id TEXT NOT NULL, -- User ID from auth (might be UUID or string)
    content TEXT NOT NULL,
    is_system BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_comments_entity ON comments(entity_type, entity_id);
