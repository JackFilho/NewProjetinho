-- Migration: 013_fix_sessions_table.sql
-- Description: Corrigir estrutura da tabela sessions para compatibilidade
-- Date: 2025-01-27

-- ================================================
-- CORREÇÃO DA TABELA SESSIONS
-- ================================================

-- Remover tabela sessions existente se houver inconsistência
DROP TABLE IF EXISTS sessions;

-- Recriar tabela sessions com estrutura correta
CREATE TABLE sessions (
    sid VARCHAR(255) PRIMARY KEY,
    sess TEXT NOT NULL,
    expire VARCHAR(255) NOT NULL,
    INDEX IDX_session_expire (expire)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ================================================
-- CORREÇÕES ADICIONAIS NAS CONFIGURAÇÕES GLOBAIS
-- ================================================

-- Adicionar colunas faltantes na tabela global_settings
ALTER TABLE global_settings 
ADD COLUMN IF NOT EXISTS system_name VARCHAR(255) DEFAULT 'Agenday',
ADD COLUMN IF NOT EXISTS secondary_color VARCHAR(7) DEFAULT '#64748b',
ADD COLUMN IF NOT EXISTS background_color VARCHAR(7) DEFAULT '#f8fafc',
ADD COLUMN IF NOT EXISTS text_color VARCHAR(7) DEFAULT '#1e293b',
ADD COLUMN IF NOT EXISTS evolution_api_global_key VARCHAR(500);

-- ================================================
-- CORREÇÕES NA TABELA ADMINS
-- ================================================

-- Adicionar colunas faltantes na tabela admins
ALTER TABLE admins 
ADD COLUMN IF NOT EXISTS username VARCHAR(100) UNIQUE,
ADD COLUMN IF NOT EXISTS first_name VARCHAR(100),
ADD COLUMN IF NOT EXISTS last_name VARCHAR(100);

-- Atualizar username baseado no email para registros existentes
UPDATE admins 
SET username = SUBSTRING_INDEX(email, '@', 1) 
WHERE username IS NULL;

-- ================================================
-- CORREÇÕES NA TABELA PLANS
-- ================================================

-- Adicionar coluna faltante na tabela plans
ALTER TABLE plans 
ADD COLUMN IF NOT EXISTS stripe_annual_price_id VARCHAR(255);

-- Registrar migration
INSERT IGNORE INTO migrations (filename) VALUES ('013_fix_sessions_table.sql');