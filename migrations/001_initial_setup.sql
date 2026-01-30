-- Migration: 001_initial_setup.sql
-- Description: Criação da estrutura inicial do banco de dados
-- Date: 2025-06-28

-- ================================================
-- CONFIGURAÇÕES GLOBAIS
-- ================================================

CREATE TABLE IF NOT EXISTS global_settings (
    id INT PRIMARY KEY AUTO_INCREMENT,
    logo_url TEXT,
    company_name VARCHAR(255) DEFAULT 'Sistema de Agendamentos',
    primary_color VARCHAR(7) DEFAULT '#3b82f6',
    system_url VARCHAR(255),
    favicon_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ================================================
-- SISTEMA DE SESSÕES
-- ================================================

CREATE TABLE IF NOT EXISTS sessions (
    session_id VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
    expires INT(11) UNSIGNED NOT NULL,
    data MEDIUMTEXT COLLATE utf8mb4_bin,
    PRIMARY KEY (session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

-- ================================================
-- TABELA DE MIGRATIONS
-- ================================================

CREATE TABLE IF NOT EXISTS migrations (
    id INT PRIMARY KEY AUTO_INCREMENT,
    filename VARCHAR(255) NOT NULL UNIQUE,
    executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_filename (filename)
);

-- ================================================
-- INSERÇÃO DE DADOS INICIAIS
-- ================================================

-- Configurações globais padrão
INSERT INTO global_settings (logo_url, company_name, primary_color) 
VALUES ('', 'Agenday', '#5e6d8d')
ON DUPLICATE KEY UPDATE id=id;

-- Registrar esta migration
INSERT IGNORE INTO migrations (filename) VALUES ('001_initial_setup.sql');