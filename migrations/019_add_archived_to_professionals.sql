-- Migration: Add archived column to professionals table
-- This allows soft delete functionality while preserving historical data

ALTER TABLE professionals
ADD COLUMN archived INT DEFAULT 0 AFTER active;

-- Add index for faster queries filtering by archived status
CREATE INDEX idx_professionals_archived ON professionals(archived);

-- Add comment to document the column purpose
ALTER TABLE professionals
MODIFY COLUMN archived INT DEFAULT 0 COMMENT 'Soft delete flag: 0 = active, 1 = archived (keeps historical data)';
