-- Migration: 005_appointment_system.sql
-- Description: Sistema de agendamentos, profissionais, serviços e clientes
-- Date: 2025-06-28

-- ================================================
-- SISTEMA DE PROFISSIONAIS
-- ================================================

CREATE TABLE IF NOT EXISTS professionals (
    id INT PRIMARY KEY AUTO_INCREMENT,
    company_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(20),
    password VARCHAR(255),
    specialty VARCHAR(255),
    working_hours JSON,
    is_active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_company (company_id),
    INDEX idx_email (email),
    INDEX idx_active (is_active),
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

-- ================================================
-- SISTEMA DE SERVIÇOS
-- ================================================

CREATE TABLE IF NOT EXISTS services (
    id INT PRIMARY KEY AUTO_INCREMENT,
    company_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    duration INT NOT NULL COMMENT 'Duration in minutes',
    color VARCHAR(7) DEFAULT '#3b82f6',
    is_active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_company (company_id),
    INDEX idx_active (is_active),
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

-- ================================================
-- SISTEMA DE CLIENTES
-- ================================================

CREATE TABLE IF NOT EXISTS clients (
    id INT PRIMARY KEY AUTO_INCREMENT,
    company_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    birth_date DATE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_company (company_id),
    INDEX idx_email (email),
    INDEX idx_phone (phone),
    INDEX idx_birth_date (birth_date),
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

-- ================================================
-- SISTEMA DE AGENDAMENTOS
-- ================================================

CREATE TABLE IF NOT EXISTS appointments (
    id INT PRIMARY KEY AUTO_INCREMENT,
    company_id INT NOT NULL,
    professional_id INT NOT NULL,
    service_id INT NOT NULL,
    client_name VARCHAR(255) NOT NULL,
    client_phone VARCHAR(50),
    client_email VARCHAR(255),
    appointment_date DATE NOT NULL,
    appointment_time VARCHAR(10) NOT NULL,
    duration INT DEFAULT 30 COMMENT 'Duração em minutos',
    total_price DECIMAL(10,2) DEFAULT 0.00,
    status VARCHAR(50) NOT NULL DEFAULT 'agendado',
    notes TEXT,
    reminder_sent INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_company (company_id),
    INDEX idx_professional (professional_id),
    INDEX idx_service (service_id),
    INDEX idx_appointment_date (appointment_date),
    INDEX idx_status (status),
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    FOREIGN KEY (professional_id) REFERENCES professionals(id) ON DELETE CASCADE,
    FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
);

-- ================================================
-- STATUS DE AGENDAMENTOS
-- ================================================

CREATE TABLE IF NOT EXISTS status (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    color VARCHAR(7) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS clients (
    id INT PRIMARY KEY AUTO_INCREMENT,
    company_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(20),
    cpf VARCHAR(15),
    birth_date DATE,
    address TEXT,
    notes TEXT,
    points INT DEFAULT 0,
    is_active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_company (company_id),
    INDEX idx_email (email),
    INDEX idx_phone (phone),
    INDEX idx_cpf (cpf),
    INDEX idx_active (is_active),
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

-- ================================================
-- SISTEMA DE AGENDAMENTOS
-- ================================================

CREATE TABLE IF NOT EXISTS appointments (
    id INT PRIMARY KEY AUTO_INCREMENT,
    company_id INT NOT NULL,
    service_id INT NOT NULL,
    professional_id INT NOT NULL,
    client_name VARCHAR(255) NOT NULL,
    client_email VARCHAR(255),
    client_phone VARCHAR(20),
    appointment_date DATE NOT NULL,
    appointment_time VARCHAR(5) NOT NULL,
    duration INT,
    status VARCHAR(50) DEFAULT 'Pendente',
    notes TEXT,
    total_price DECIMAL(10,2),
    reminder_sent TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_company (company_id),
    INDEX idx_service (service_id),
    INDEX idx_professional (professional_id),
    INDEX idx_date (appointment_date),
    INDEX idx_status (status),
    INDEX idx_client_phone (client_phone),
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    FOREIGN KEY (service_id) REFERENCES services(id),
    FOREIGN KEY (professional_id) REFERENCES professionals(id)
);

-- ================================================
-- STATUS DOS AGENDAMENTOS
-- ================================================

CREATE TABLE IF NOT EXISTS appointment_status (
    id INT PRIMARY KEY AUTO_INCREMENT,
    company_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    color VARCHAR(7) NOT NULL,
    is_default TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_company (company_id),
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

-- ================================================
-- SISTEMA DE TAREFAS
-- ================================================

CREATE TABLE IF NOT EXISTS tasks (
    id INT PRIMARY KEY AUTO_INCREMENT,
    company_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    due_date DATE,
    is_completed TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_company (company_id),
    INDEX idx_due_date (due_date),
    INDEX idx_completed (is_completed),
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

-- ================================================
-- INSERÇÃO DE DADOS INICIAIS
-- ================================================

-- Profissional padrão para empresa de teste
INSERT INTO professionals (company_id, name, email, specialty) 
SELECT id, 'Profissional Teste', 'profissional@teste.com', 'Geral' 
FROM companies 
WHERE email = 'teste@empresa.com' 
AND NOT EXISTS (SELECT 1 FROM professionals WHERE company_id = companies.id);

-- Serviço padrão para empresa de teste
INSERT INTO services (company_id, name, description, price, duration, color) 
SELECT id, 'Corte de Cabelo', 'Corte de cabelo masculino e feminino', 30.00, 60, '#3b82f6' 
FROM companies 
WHERE email = 'teste@empresa.com' 
AND NOT EXISTS (SELECT 1 FROM services WHERE company_id = companies.id);

-- Registrar esta migration
INSERT IGNORE INTO migrations (filename) VALUES ('005_appointment_system.sql');