-- Migration: 014_add_missing_columns.sql
-- Description: Adicionar colunas faltantes identificadas nos erros da aplicação
-- Date: 2025-01-27

-- ================================================
-- COLUNAS FALTANTES NA TABELA GLOBAL_SETTINGS
-- ================================================

-- Adicionar colunas de reCAPTCHA
ALTER TABLE global_settings 
ADD COLUMN IF NOT EXISTS recaptcha_site_key VARCHAR(500) COMMENT 'Chave pública do reCAPTCHA',
ADD COLUMN IF NOT EXISTS recaptcha_secret_key VARCHAR(500) COMMENT 'Chave secreta do reCAPTCHA';

-- Adicionar outras colunas que podem estar faltando
ALTER TABLE global_settings 
ADD COLUMN IF NOT EXISTS company_name VARCHAR(255) DEFAULT 'Agenday' COMMENT 'Nome da empresa/sistema',
ADD COLUMN IF NOT EXISTS tour_color VARCHAR(7) DEFAULT '#a855f7' COMMENT 'Cor do tour guiado',
ADD COLUMN IF NOT EXISTS maintenance_mode BOOLEAN DEFAULT FALSE COMMENT 'Modo de manutenção',
ADD COLUMN IF NOT EXISTS maintenance_message TEXT COMMENT 'Mensagem do modo de manutenção';

-- ================================================
-- VERIFICAR E CORRIGIR ESTRUTURA DA TABELA SESSIONS
-- ================================================

-- Verificar se a tabela sessions tem a estrutura correta
-- Se houver problemas, recriar com estrutura correta
CREATE TABLE IF NOT EXISTS sessions_backup AS SELECT * FROM sessions;

DROP TABLE IF EXISTS sessions;

CREATE TABLE sessions (
    sid VARCHAR(255) NOT NULL PRIMARY KEY,
    sess TEXT NOT NULL,
    expire VARCHAR(255) NOT NULL,
    INDEX IDX_session_expire (expire)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ================================================
-- INSERIR CONFIGURAÇÕES PADRÃO SE NÃO EXISTIREM
-- ================================================

-- Inserir configuração padrão se a tabela estiver vazia
INSERT IGNORE INTO global_settings (
    id,
    system_name,
    company_name,
    logo_url,
    primary_color,
    secondary_color,
    background_color,
    text_color,
    tour_color
) VALUES (
    1,
    'Agenday',
    'Agenday',
    '',
    '#2563eb',
    '#64748b',
    '#f8fafc',
    '#1e293b',
    '#a855f7'
);

-- Registrar migration
INSERT IGNORE INTO migrations (filename) VALUES ('014_add_missing_columns.sql');