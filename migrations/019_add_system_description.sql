-- Add system description field to global_settings table
ALTER TABLE global_settings
ADD COLUMN IF NOT EXISTS system_description TEXT AFTER system_name;
