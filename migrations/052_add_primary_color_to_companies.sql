-- Add primary_color column to companies table
ALTER TABLE companies ADD COLUMN primary_color VARCHAR(7) DEFAULT NULL;
