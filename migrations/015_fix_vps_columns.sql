-- Migration: 015_fix_vps_columns.sql
-- Description: Corrigir colunas faltantes específicas do VPS
-- Date: 2025-01-27

-- ================================================
-- ADICIONAR TODAS AS COLUNAS FALTANTES
-- ================================================

-- Verificar e adicionar colunas na tabela global_settings
ALTER TABLE global_settings 
ADD COLUMN IF NOT EXISTS recaptcha_site_key VARCHAR(500) DEFAULT NULL COMMENT 'Chave pública do reCAPTCHA',
ADD COLUMN IF NOT EXISTS recaptcha_secret_key VARCHAR(500) DEFAULT NULL COMMENT 'Chave secreta do reCAPTCHA',
ADD COLUMN IF NOT EXISTS company_name VARCHAR(255) DEFAULT NULL COMMENT 'Nome da empresa/sistema',
ADD COLUMN IF NOT EXISTS tour_color VARCHAR(7) DEFAULT NULL COMMENT 'Cor do tour guiado',
ADD COLUMN IF NOT EXISTS maintenance_mode BOOLEAN DEFAULT FALSE COMMENT 'Modo de manutenção',
ADD COLUMN IF NOT EXISTS maintenance_message TEXT DEFAULT NULL COMMENT 'Mensagem do modo de manutenção';

-- Verificar se as colunas SMTP existem
ALTER TABLE global_settings 
ADD COLUMN IF NOT EXISTS smtp_host VARCHAR(255) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS smtp_port VARCHAR(10) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS smtp_user VARCHAR(255) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS smtp_password VARCHAR(255) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS smtp_from_email VARCHAR(255) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS smtp_from_name VARCHAR(255) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS smtp_secure VARCHAR(10) DEFAULT NULL;

-- Verificar se as colunas OpenAI existem
ALTER TABLE global_settings 
ADD COLUMN IF NOT EXISTS openai_api_key VARCHAR(500) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS openai_model VARCHAR(100) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS openai_temperature VARCHAR(10) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS openai_max_tokens VARCHAR(10) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS default_ai_prompt TEXT DEFAULT NULL;

-- Verificar se as colunas Evolution API existem
ALTER TABLE global_settings 
ADD COLUMN IF NOT EXISTS evolution_api_url VARCHAR(500) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS evolution_api_global_key VARCHAR(500) DEFAULT NULL;

-- Verificar outras colunas importantes
ALTER TABLE global_settings 
ADD COLUMN IF NOT EXISTS system_name VARCHAR(255) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS secondary_color VARCHAR(7) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS background_color VARCHAR(7) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS text_color VARCHAR(7) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS custom_html TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS custom_domain_url VARCHAR(500) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS system_url VARCHAR(500) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS default_birthday_message TEXT DEFAULT NULL;

-- ================================================
-- GARANTIR QUE EXISTE UM REGISTRO PADRÃO
-- ================================================

-- Inserir ou atualizar configuração padrão
INSERT INTO global_settings (
    id,
    system_name,
    company_name,
    logo_url,
    favicon_url,
    primary_color,
    secondary_color,
    background_color,
    text_color,
    tour_color,
    openai_model,
    openai_temperature,
    openai_max_tokens,
    smtp_port,
    smtp_secure
) VALUES (
    1,
    'Agenday',
    'Agenday',
    '',
    '',
    '#2563eb',
    '#64748b',
    '#f8fafc',
    '#1e293b',
    '#a855f7',
    'gpt-4o',
    '0.70',
    '4000',
    '587',
    'tls'
) ON DUPLICATE KEY UPDATE
    system_name = COALESCE(system_name, 'Agenday'),
    company_name = COALESCE(company_name, 'Agenday'),
    primary_color = COALESCE(primary_color, '#2563eb'),
    secondary_color = COALESCE(secondary_color, '#64748b'),
    background_color = COALESCE(background_color, '#f8fafc'),
    text_color = COALESCE(text_color, '#1e293b'),
    tour_color = COALESCE(tour_color, '#a855f7'),
    openai_model = COALESCE(openai_model, 'gpt-4o'),
    openai_temperature = COALESCE(openai_temperature, '0.70'),
    openai_max_tokens = COALESCE(openai_max_tokens, '4000'),
    smtp_port = COALESCE(smtp_port, '587'),
    smtp_secure = COALESCE(smtp_secure, 'tls');

-- Registrar migration
INSERT IGNORE INTO migrations (filename) VALUES ('015_fix_vps_columns.sql');