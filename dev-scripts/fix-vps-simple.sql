-- SQL simples para corrigir problemas no VPS
-- Execute: mysql -h HOST -u USER -pPASSWORD DATABASE < fix-vps-simple.sql

-- Adicionar colunas faltantes (todas com DEFAULT NULL)
ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS recaptcha_site_key VARCHAR(500) DEFAULT NULL;
ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS recaptcha_secret_key VARCHAR(500) DEFAULT NULL;
ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS company_name VARCHAR(255) DEFAULT NULL;
ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS tour_color VARCHAR(7) DEFAULT NULL;
ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS maintenance_mode BOOLEAN DEFAULT FALSE;
ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS maintenance_message TEXT DEFAULT NULL;
ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS system_name VARCHAR(255) DEFAULT NULL;
ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS secondary_color VARCHAR(7) DEFAULT NULL;
ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS background_color VARCHAR(7) DEFAULT NULL;
ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS text_color VARCHAR(7) DEFAULT NULL;
ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS custom_html TEXT DEFAULT NULL;
ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS custom_domain_url VARCHAR(500) DEFAULT NULL;
ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS system_url VARCHAR(500) DEFAULT NULL;
ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS default_birthday_message TEXT DEFAULT NULL;
ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS smtp_host VARCHAR(255) DEFAULT NULL;
ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS smtp_port VARCHAR(10) DEFAULT NULL;
ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS smtp_user VARCHAR(255) DEFAULT NULL;
ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS smtp_password VARCHAR(255) DEFAULT NULL;
ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS smtp_from_email VARCHAR(255) DEFAULT NULL;
ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS smtp_from_name VARCHAR(255) DEFAULT NULL;
ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS smtp_secure VARCHAR(10) DEFAULT NULL;
ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS openai_api_key VARCHAR(500) DEFAULT NULL;
ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS openai_model VARCHAR(100) DEFAULT NULL;
ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS openai_temperature VARCHAR(10) DEFAULT NULL;
ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS openai_max_tokens VARCHAR(10) DEFAULT NULL;
ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS default_ai_prompt TEXT DEFAULT NULL;
ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS evolution_api_url VARCHAR(500) DEFAULT NULL;
ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS evolution_api_global_key VARCHAR(500) DEFAULT NULL;

-- Garantir que existe um registro padrão (apenas valores essenciais)
INSERT INTO global_settings (id, logo_url, primary_color) VALUES (1, '', '#2563eb') 
ON DUPLICATE KEY UPDATE id = id;

-- Corrigir tabela sessions
DROP TABLE IF EXISTS sessions;
CREATE TABLE sessions (
    sid VARCHAR(255) NOT NULL PRIMARY KEY,
    sess TEXT NOT NULL,
    expire VARCHAR(255) NOT NULL,
    INDEX IDX_session_expire (expire)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;