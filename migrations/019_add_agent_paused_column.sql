-- Migration: Add agent_paused column to companies table
-- Purpose: Allow companies to pause AI agent responses manually
-- Date: 2025-01-03

ALTER TABLE companies
ADD COLUMN agent_paused TINYINT(1) DEFAULT 0 NOT NULL
COMMENT 'When 1, AI agent will not respond to messages for this company';

-- Set all existing companies to active (not paused)
UPDATE companies SET agent_paused = 0 WHERE agent_paused IS NULL;
