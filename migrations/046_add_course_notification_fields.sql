-- Migration: Add course notification fields to companies table
-- Similar to human request notification but for course inquiries

-- Add course notification fields
ALTER TABLE companies
ADD COLUMN IF NOT EXISTS course_notification_enabled INT NOT NULL DEFAULT 0 COMMENT 'Enable/disable course notification feature',
ADD COLUMN IF NOT EXISTS course_notification_contact VARCHAR(255) COMMENT 'WhatsApp group ID or phone number for course notifications',
ADD COLUMN IF NOT EXISTS course_notification_message TEXT COMMENT 'Custom notification message for course inquiries',
ADD COLUMN IF NOT EXISTS course_notification_keywords TEXT COMMENT 'Keywords that trigger course notification (one per line)';
