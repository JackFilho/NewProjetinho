-- Migration: Add course_sent_at column to conversations table
-- This column tracks when course notification was sent to avoid duplicate sends

ALTER TABLE conversations
ADD COLUMN course_sent_at TIMESTAMP NULL DEFAULT NULL;

-- Add index for faster lookups
CREATE INDEX idx_conversations_course_sent_at ON conversations(course_sent_at);
