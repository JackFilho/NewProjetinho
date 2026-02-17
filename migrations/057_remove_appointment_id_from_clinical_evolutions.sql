-- Remove appointment_id column from clinical_evolutions table
-- Must drop the foreign key constraint before dropping the column

-- Step 1: Find and drop the foreign key constraint dynamically
SET @constraint_name = (
  SELECT CONSTRAINT_NAME
  FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'clinical_evolutions'
    AND COLUMN_NAME = 'appointment_id'
    AND REFERENCED_TABLE_NAME IS NOT NULL
  LIMIT 1
);

SET @drop_fk = IF(
  @constraint_name IS NOT NULL,
  CONCAT('ALTER TABLE clinical_evolutions DROP FOREIGN KEY `', @constraint_name, '`'),
  'SELECT 1'
);

PREPARE stmt FROM @drop_fk;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Step 2: Drop the column (also removes the index idx_evolution_appointment)
ALTER TABLE clinical_evolutions DROP COLUMN appointment_id;
