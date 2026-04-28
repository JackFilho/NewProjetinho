-- Migration: Add professional exceptional schedules table
-- This table stores specific dates with custom working hours (different from regular schedule)
-- Example: Professional normally works 9h-18h on Tuesdays, but on 28/01/2026 will only work 9h-12h

CREATE TABLE IF NOT EXISTS professional_exceptional_schedules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  professional_id INT NOT NULL,
  exception_date DATE NOT NULL COMMENT 'Specific date with exceptional schedule',
  start_time TIME NOT NULL COMMENT 'Start time for this specific date',
  end_time TIME NOT NULL COMMENT 'End time for this specific date',
  reason VARCHAR(255) COMMENT 'Optional reason (manhã apenas, fechado à tarde, etc.)',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (professional_id) REFERENCES professionals(id) ON DELETE CASCADE,
  INDEX idx_professional_exception_date (professional_id, exception_date),
  UNIQUE KEY unique_professional_exception_date (professional_id, exception_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
