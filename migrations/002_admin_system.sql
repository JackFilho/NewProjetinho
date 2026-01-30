-- Migration: 002_admin_system.sql
-- Description: Sistema de administradores e configurações
-- Date: 2025-06-28

-- ================================================
-- SISTEMA DE ADMINISTRADORES
-- ================================================

CREATE TABLE IF NOT EXISTS admins (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    is_active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_email (email),
    INDEX idx_active (is_active)
);

-- ================================================
-- CONFIGURAÇÕES AVANÇADAS DO SISTEMA
-- ================================================

-- Adicionar colunas de configuração OpenAI às configurações globais
ALTER TABLE global_settings 
ADD COLUMN IF NOT EXISTS openai_api_key TEXT,
ADD COLUMN IF NOT EXISTS openai_model VARCHAR(100) DEFAULT 'gpt-4',
ADD COLUMN IF NOT EXISTS openai_temperature DECIMAL(2,1) DEFAULT 0.7,
ADD COLUMN IF NOT EXISTS openai_max_tokens INT DEFAULT 1500;

-- Adicionar colunas de configuração Evolution API
ALTER TABLE global_settings 
ADD COLUMN IF NOT EXISTS evolution_api_url VARCHAR(500),
ADD COLUMN IF NOT EXISTS evolution_api_key TEXT;

-- Adicionar colunas de configuração SMTP
ALTER TABLE global_settings 
ADD COLUMN IF NOT EXISTS smtp_host VARCHAR(255),
ADD COLUMN IF NOT EXISTS smtp_port INT DEFAULT 587,
ADD COLUMN IF NOT EXISTS smtp_user VARCHAR(255),
ADD COLUMN IF NOT EXISTS smtp_password TEXT,
ADD COLUMN IF NOT EXISTS smtp_from_email VARCHAR(255),
ADD COLUMN IF NOT EXISTS smtp_from_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS smtp_secure VARCHAR(10) DEFAULT 'tls';

-- ================================================
-- INSERÇÃO DE DADOS INICIAIS
-- ================================================

-- Administrador padrão (senha: @Arcano1987)
INSERT IGNORE INTO admins (name, email, password, is_active) 
VALUES ('Gilliard', 'gilliard/', '$2b$12$8H.kWrJ7tFfJrj8xJNqb3.ZGO5wJ8oHzQ3E5wJ5xJqBd.vM4cGQ4W', 1);

-- Registrar esta migration
INSERT IGNORE INTO migrations (filename) VALUES ('002_admin_system.sql');