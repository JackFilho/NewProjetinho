-- Migration 026: Add takeover mode support for human intervention
-- This allows humans to take over conversations from the AI agent

ALTER TABLE conversations
ADD COLUMN takeover_mode ENUM('agent', 'human') DEFAULT 'agent' AFTER last_message_at;

-- Index for faster queries when filtering by takeover_mode
CREATE INDEX idx_conversations_takeover_mode ON conversations(takeover_mode);
