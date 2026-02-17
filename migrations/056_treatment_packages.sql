-- Migration 056: Pacotes de Tratamento (Treatment Packages)
-- Permite agendar pacotes de sessões recorrentes para especialidades de saúde
-- como fisioterapia, psicologia, etc.

CREATE TABLE IF NOT EXISTS treatment_packages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  client_id INT NOT NULL,
  professional_id INT NOT NULL,
  service_id INT NOT NULL,
  total_sessions INT NOT NULL,
  completed_sessions INT NOT NULL DEFAULT 0,
  cancelled_sessions INT NOT NULL DEFAULT 0,
  recurrence_type VARCHAR(20) NOT NULL DEFAULT 'weekly',
  recurrence_days JSON DEFAULT NULL,
  preferred_time VARCHAR(10) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE DEFAULT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  notes TEXT,
  total_price DECIMAL(10,2) DEFAULT '0.00',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_pkg_company (company_id),
  INDEX idx_pkg_client (client_id),
  INDEX idx_pkg_professional (professional_id),
  INDEX idx_pkg_status (company_id, status),
  INDEX idx_pkg_company_client (company_id, client_id),
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (professional_id) REFERENCES professionals(id) ON DELETE RESTRICT,
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Adicionar colunas de pacote na tabela de agendamentos
ALTER TABLE appointments
  ADD COLUMN package_id INT DEFAULT NULL,
  ADD COLUMN session_number INT DEFAULT NULL,
  ADD INDEX idx_apt_package (package_id),
  ADD FOREIGN KEY (package_id) REFERENCES treatment_packages(id) ON DELETE SET NULL;
