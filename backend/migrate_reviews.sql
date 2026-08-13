-- Nexora - Review Enhancement Migration
-- Add new columns to reviews table

ALTER TABLE reviews ADD COLUMN image_urls TEXT;
ALTER TABLE reviews ADD COLUMN reply TEXT;
ALTER TABLE reviews ADD COLUMN replied_at DATETIME;
ALTER TABLE reviews ADD COLUMN is_approved BOOLEAN DEFAULT 1;

-- Create feedbacks table (Part 2)
CREATE TABLE IF NOT EXISTS feedbacks (
    id CHAR(36) PRIMARY KEY,
    workspace_id CHAR(36) NOT NULL REFERENCES workspaces(id),
    user_id CHAR(36) NOT NULL REFERENCES users(id),
    type VARCHAR(20) NOT NULL,
    nps_score INTEGER,
    content TEXT,
    created_at DATETIME DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_feedbacks_workspace_id ON feedbacks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_feedbacks_user_id ON feedbacks(user_id);
CREATE INDEX IF NOT EXISTS idx_feedbacks_type ON feedbacks(type);
