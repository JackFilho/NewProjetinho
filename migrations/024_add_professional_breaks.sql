-- Migration: Add professional breaks/pauses table
-- This table stores break times for professionals on specific days

CREATE TABLE IF NOT EXISTS professional_breaks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  professional_id INT NOT NULL,
  day_of_week VARCHAR(20) NOT NULL COMMENT 'domingo, segunda, terca, quarta, quinta, sexta, sabado',
  start_time VARCHAR(10) NOT NULL COMMENT 'HH:MM format',
  end_time VARCHAR(10) NOT NULL COMMENT 'HH:MM format',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (professional_id) REFERENCES professionals(id) ON DELETE CASCADE,
  INDEX idx_professional_day (professional_id, day_of_week)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
