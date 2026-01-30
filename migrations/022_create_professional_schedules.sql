-- Migration 022: Create professional_schedules table for individual day schedules
-- Allows each professional to have different working hours for each day of the week
-- Example: Monday 09:00-18:00, Wednesday 09:00-22:00, etc.

CREATE TABLE IF NOT EXISTS professional_schedules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  professional_id INT NOT NULL,
  day_of_week INT NOT NULL, -- 0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday
  start_time VARCHAR(10) NOT NULL, -- HH:MM format (e.g., "09:00")
  end_time VARCHAR(10) NOT NULL, -- HH:MM format (e.g., "18:00")
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  FOREIGN KEY (professional_id) REFERENCES professionals(id) ON DELETE CASCADE,
  UNIQUE KEY unique_professional_day (professional_id, day_of_week)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create index for faster queries
CREATE INDEX idx_professional_id ON professional_schedules(professional_id);

COMMIT;
