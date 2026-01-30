-- Add auto_select_professional column to companies table
-- When enabled and only one professional exists, skip professional selection in agent
ALTER TABLE companies
ADD COLUMN auto_select_professional TINYINT(1) DEFAULT 0 COMMENT 'Auto select professional when only one exists';
