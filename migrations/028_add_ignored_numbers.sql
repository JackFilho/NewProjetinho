-- Migration: Add ignored_numbers column to companies table
-- Description: Stores a list of phone numbers that the AI agent should ignore
-- Format: One phone number per line, normalized with country code

ALTER TABLE companies
ADD COLUMN ignored_numbers TEXT NULL
COMMENT 'List of phone numbers to ignore (one per line, normalized with DDI)';
