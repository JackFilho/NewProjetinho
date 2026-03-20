-- Migration 059: Instagram Integration
-- Adiciona suporte a Instagram Messaging API com sincronização Chatwoot

-- 1. Campos de Instagram na tabela companies
ALTER TABLE companies
  ADD COLUMN instagram_enabled INT NOT NULL DEFAULT 0 AFTER chatwoot_inbox_id,
  ADD COLUMN instagram_page_id VARCHAR(100) AFTER instagram_enabled,
  ADD COLUMN instagram_access_token TEXT AFTER instagram_page_id,
  ADD COLUMN instagram_business_account_id VARCHAR(100) AFTER instagram_access_token,
  ADD COLUMN chatwoot_instagram_inbox_id INT AFTER instagram_business_account_id;

-- 2. Tabela de instâncias Instagram
CREATE TABLE IF NOT EXISTS instagram_instances (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  instance_name VARCHAR(255) NOT NULL,
  status VARCHAR(50) DEFAULT 'disconnected',
  ig_business_account_id VARCHAR(100),
  facebook_page_id VARCHAR(100),
  page_access_token TEXT,
  meta_app_id VARCHAR(100),
  meta_app_secret VARCHAR(255),
  webhook_verify_token VARCHAR(255),
  ig_username VARCHAR(255),
  ig_profile_picture_url TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_ig_company (company_id),
  INDEX idx_ig_business_account (ig_business_account_id)
);

-- 3. Campo channel na tabela chatwoot_conversation_map
ALTER TABLE chatwoot_conversation_map
  ADD COLUMN channel VARCHAR(20) NOT NULL DEFAULT 'whatsapp' AFTER phone_number;
