-- 055: Add primary_color column to companies table
-- Allows each company to define their own brand color.
-- Falls back to the global primaryColor (#2563eb) when NULL.

ALTER TABLE companies ADD COLUMN primary_color VARCHAR(7) DEFAULT NULL;
