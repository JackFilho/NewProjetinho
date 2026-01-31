-- Migration: Add course notification timeout field to companies table
-- This field controls how long the AI agent pauses after course notification is triggered

ALTER TABLE companies
ADD COLUMN IF NOT EXISTS course_notification_timeout INT NOT NULL DEFAULT 30 COMMENT 'Minutes to pause AI agent after course notification (10, 20, 30, 60)';
