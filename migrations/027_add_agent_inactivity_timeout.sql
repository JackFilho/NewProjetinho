-- Migration 027: Add agent inactivity timeout configuration per company
-- Allows each company to define their own takeover timeout period

-- First, fix any invalid default values in reset_token_expires
ALTER TABLE companies MODIFY COLUMN reset_token_expires TIMESTAMP NULL DEFAULT NULL;

-- Now add the new column
ALTER TABLE companies
ADD COLUMN agent_inactivity_timeout INT NOT NULL DEFAULT 30 COMMENT 'Minutes of inactivity before AI agent resumes (10, 20, 30, 60)';

-- Set default value for existing companies
UPDATE companies SET agent_inactivity_timeout = 30 WHERE agent_inactivity_timeout IS NULL;
