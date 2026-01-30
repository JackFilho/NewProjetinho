-- Add 'holiday' type to admin_alerts
-- First, let's check the current column type and modify accordingly

-- Option 1: If type is an ENUM, modify it to add 'holiday'
ALTER TABLE admin_alerts
MODIFY COLUMN type ENUM('info', 'warning', 'success', 'error', 'holiday') NOT NULL DEFAULT 'info';

-- If Option 1 fails because it's already VARCHAR, use Option 2 below:
-- ALTER TABLE admin_alerts
-- MODIFY COLUMN type VARCHAR(50) NOT NULL DEFAULT 'info';
