-- Migration: Add professional exception breaks table
-- This table stores break/pause times for exceptional schedule dates

CREATE TABLE IF NOT EXISTS professional_exception_breaks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  exceptional_schedule_id INT NOT NULL,
  start_time VARCHAR(10) NOT NULL COMMENT 'HH:MM format',
  end_time VARCHAR(10) NOT NULL COMMENT 'HH:MM format',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (exceptional_schedule_id) REFERENCES professional_exceptional_schedules(id) ON DELETE CASCADE,
  INDEX idx_exceptional_schedule (exceptional_schedule_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
