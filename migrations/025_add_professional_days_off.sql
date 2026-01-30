-- Migration: Add professional days off table
-- This table stores specific dates when a professional is not available

CREATE TABLE IF NOT EXISTS professional_days_off (
  id INT AUTO_INCREMENT PRIMARY KEY,
  professional_id INT NOT NULL,
  date_off DATE NOT NULL COMMENT 'Specific date when professional is off',
  reason VARCHAR(255) COMMENT 'Optional reason (férias, consulta médica, etc.)',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (professional_id) REFERENCES professionals(id) ON DELETE CASCADE,
  INDEX idx_professional_date (professional_id, date_off),
  UNIQUE KEY unique_professional_date (professional_id, date_off)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
