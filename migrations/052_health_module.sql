-- Migration 052: Módulo de Saúde (InHouse Saúde)
-- Adiciona especialidade de saúde às empresas, sistema de anamnese e evolução clínica.

-- 1. Adicionar coluna health_specialty na tabela companies
ALTER TABLE companies
  ADD COLUMN health_specialty VARCHAR(100) DEFAULT NULL
  AFTER logo_url;

-- 2. Modelos de anamnese (company_id NULL = template padrão do sistema por especialidade)
CREATE TABLE IF NOT EXISTS anamnesis_templates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT DEFAULT NULL,
  specialty VARCHAR(100) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  is_active INT NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_anamnesis_tpl_company (company_id),
  INDEX idx_anamnesis_tpl_specialty (specialty),
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Campos/perguntas dos modelos de anamnese
CREATE TABLE IF NOT EXISTS anamnesis_template_fields (
  id INT AUTO_INCREMENT PRIMARY KEY,
  template_id INT NOT NULL,
  section VARCHAR(255) DEFAULT NULL,
  label VARCHAR(500) NOT NULL,
  field_type VARCHAR(50) NOT NULL DEFAULT 'text',
  options JSON DEFAULT NULL,
  is_required INT NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  placeholder VARCHAR(255) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_anamnesis_field_template (template_id),
  FOREIGN KEY (template_id) REFERENCES anamnesis_templates(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Fichas de anamnese preenchidas por cliente
CREATE TABLE IF NOT EXISTS anamnesis_records (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  client_id INT NOT NULL,
  template_id INT NOT NULL,
  answers JSON NOT NULL,
  filled_by INT DEFAULT NULL,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_anamnesis_rec_company (company_id),
  INDEX idx_anamnesis_rec_client (client_id),
  INDEX idx_anamnesis_rec_company_client (company_id, client_id),
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (template_id) REFERENCES anamnesis_templates(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Evoluções clínicas (registros por visita/atendimento)
CREATE TABLE IF NOT EXISTS clinical_evolutions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  client_id INT NOT NULL,
  professional_id INT DEFAULT NULL,
  appointment_id INT DEFAULT NULL,
  title VARCHAR(255) DEFAULT NULL,
  content TEXT NOT NULL,
  evolution_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_evolution_company (company_id),
  INDEX idx_evolution_client (client_id),
  INDEX idx_evolution_company_client (company_id, client_id),
  INDEX idx_evolution_appointment (appointment_id),
  INDEX idx_evolution_date (company_id, client_id, evolution_date),
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (professional_id) REFERENCES professionals(id) ON DELETE SET NULL,
  FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
