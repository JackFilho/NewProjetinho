-- Migration 055: Meta WhatsApp Cloud API + Chatwoot Integration
-- Configura API oficial da Meta (Tech Provider) e integra Chatwoot

-- ============================================================
-- 1. Campos para WhatsApp Provider na tabela whatsapp_instances
-- ============================================================

-- Tipo de provider (meta_official)
ALTER TABLE whatsapp_instances
  ADD COLUMN provider_type VARCHAR(20) NOT NULL DEFAULT 'meta_official'
  COMMENT 'Provider: meta_official (API oficial Meta)';

-- Campos específicos da Meta Cloud API
ALTER TABLE whatsapp_instances
  ADD COLUMN meta_phone_number_id VARCHAR(100) NULL
  COMMENT 'Phone Number ID no Meta Business (apenas meta_official)';

ALTER TABLE whatsapp_instances
  ADD COLUMN meta_waba_id VARCHAR(100) NULL
  COMMENT 'WhatsApp Business Account ID (apenas meta_official)';

ALTER TABLE whatsapp_instances
  ADD COLUMN meta_access_token TEXT NULL
  COMMENT 'Access Token do System User Meta (apenas meta_official)';

ALTER TABLE whatsapp_instances
  ADD COLUMN meta_app_id VARCHAR(100) NULL
  COMMENT 'App ID do Meta App (apenas meta_official)';

ALTER TABLE whatsapp_instances
  ADD COLUMN meta_app_secret VARCHAR(255) NULL
  COMMENT 'App Secret do Meta App (apenas meta_official)';

ALTER TABLE whatsapp_instances
  ADD COLUMN meta_webhook_verify_token VARCHAR(255) NULL
  COMMENT 'Token para verificação de webhook da Meta (apenas meta_official)';

ALTER TABLE whatsapp_instances
  ADD COLUMN meta_business_id VARCHAR(100) NULL
  COMMENT 'Meta Business Manager ID (apenas meta_official)';

ALTER TABLE whatsapp_instances
  ADD COLUMN display_phone_number VARCHAR(20) NULL
  COMMENT 'Número de telefone formatado para exibição';

ALTER TABLE whatsapp_instances
  ADD COLUMN quality_rating VARCHAR(20) NULL
  COMMENT 'Rating de qualidade do número na Meta (GREEN, YELLOW, RED)';

ALTER TABLE whatsapp_instances
  ADD COLUMN messaging_limit VARCHAR(20) NULL
  COMMENT 'Limite de mensagens (TIER_1K, TIER_10K, TIER_100K, UNLIMITED)';

-- ============================================================
-- 2. Campos Chatwoot na tabela companies
-- ============================================================

ALTER TABLE companies
  ADD COLUMN chatwoot_enabled INT NOT NULL DEFAULT 0
  COMMENT 'Se integração Chatwoot está ativa';

ALTER TABLE companies
  ADD COLUMN chatwoot_base_url VARCHAR(500) NULL
  COMMENT 'URL do Chatwoot (ex: https://app.chatwoot.com)';

ALTER TABLE companies
  ADD COLUMN chatwoot_api_token VARCHAR(500) NULL
  COMMENT 'API Access Token do Chatwoot';

ALTER TABLE companies
  ADD COLUMN chatwoot_account_id INT NULL
  COMMENT 'Account ID no Chatwoot';

ALTER TABLE companies
  ADD COLUMN chatwoot_inbox_id INT NULL
  COMMENT 'Inbox ID do WhatsApp no Chatwoot';

-- ============================================================
-- 3. Campos Chatwoot globais em global_settings
-- ============================================================

ALTER TABLE global_settings
  ADD COLUMN meta_app_id VARCHAR(100) NULL
  COMMENT 'App ID global do Meta para Tech Provider';

ALTER TABLE global_settings
  ADD COLUMN meta_app_secret VARCHAR(255) NULL
  COMMENT 'App Secret global do Meta';

ALTER TABLE global_settings
  ADD COLUMN meta_webhook_verify_token VARCHAR(255) NULL
  COMMENT 'Token de verificação global de webhook da Meta';

ALTER TABLE global_settings
  ADD COLUMN meta_business_id VARCHAR(100) NULL
  COMMENT 'Meta Business Manager ID do Tech Provider';

ALTER TABLE global_settings
  ADD COLUMN chatwoot_base_url VARCHAR(500) NULL
  COMMENT 'URL padrão do Chatwoot para novas empresas';

ALTER TABLE global_settings
  ADD COLUMN chatwoot_api_token VARCHAR(500) NULL
  COMMENT 'API Token padrão do Chatwoot';

ALTER TABLE global_settings
  ADD COLUMN chatwoot_account_id INT NULL
  COMMENT 'Account ID padrão do Chatwoot';

-- ============================================================
-- 4. Tabela de mapeamento Chatwoot <-> Conversas
-- ============================================================

CREATE TABLE IF NOT EXISTS chatwoot_conversation_map (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  conversation_id INT NOT NULL COMMENT 'ID da conversa no sistema',
  chatwoot_conversation_id INT NOT NULL COMMENT 'ID da conversa no Chatwoot',
  chatwoot_contact_id INT NOT NULL COMMENT 'ID do contato no Chatwoot',
  phone_number VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_cwmap_company (company_id),
  INDEX idx_cwmap_conversation (conversation_id),
  INDEX idx_cwmap_chatwoot (chatwoot_conversation_id),
  INDEX idx_cwmap_phone (phone_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 5. Tabela de templates de mensagem Meta
-- ============================================================

CREATE TABLE IF NOT EXISTS meta_message_templates (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  waba_id VARCHAR(100) NOT NULL,
  template_id VARCHAR(100) NOT NULL COMMENT 'ID do template na Meta',
  name VARCHAR(255) NOT NULL,
  category VARCHAR(50) NOT NULL COMMENT 'AUTHENTICATION, MARKETING, UTILITY',
  language VARCHAR(10) NOT NULL DEFAULT 'pt_BR',
  status VARCHAR(50) NOT NULL DEFAULT 'PENDING' COMMENT 'APPROVED, PENDING, REJECTED, etc.',
  components JSON COMMENT 'Componentes do template (header, body, footer, buttons)',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_meta_tpl_company (company_id),
  INDEX idx_meta_tpl_waba (waba_id),
  INDEX idx_meta_tpl_status (status),
  UNIQUE INDEX idx_meta_tpl_unique (waba_id, name, language)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 6. Tabela de status de entrega de mensagens
-- ============================================================

CREATE TABLE IF NOT EXISTS message_delivery_status (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  message_id INT NOT NULL COMMENT 'ID da mensagem no sistema',
  provider_message_id VARCHAR(255) NOT NULL COMMENT 'ID da mensagem no provider (Meta Cloud API)',
  provider_type VARCHAR(20) NOT NULL DEFAULT 'meta_official',
  status VARCHAR(20) NOT NULL DEFAULT 'sent' COMMENT 'sent, delivered, read, failed',
  error_code INT NULL,
  error_message TEXT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_mds_message (message_id),
  INDEX idx_mds_provider_msg (provider_message_id),
  INDEX idx_mds_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 7. Adicionar provider_type na tabela conversations
-- ============================================================

ALTER TABLE conversations
  ADD COLUMN provider_type VARCHAR(20) NOT NULL DEFAULT 'meta_official'
  COMMENT 'Provider WhatsApp desta conversa';

-- ============================================================
-- Done
-- ============================================================
