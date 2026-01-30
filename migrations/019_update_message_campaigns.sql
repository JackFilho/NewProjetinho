-- Migration: 019_update_message_campaigns.sql
-- Description: Atualiza estrutura da tabela message_campaigns para corresponder ao novo schema
-- Date: 2025-12-19

-- ================================================
-- AJUSTES NA TABELA MESSAGE_CAMPAIGNS
-- ================================================

-- Adicionar novos campos se não existirem
ALTER TABLE message_campaigns
ADD COLUMN IF NOT EXISTS message TEXT AFTER name;

ALTER TABLE message_campaigns
ADD COLUMN IF NOT EXISTS target_type VARCHAR(20) AFTER status;

ALTER TABLE message_campaigns
ADD COLUMN IF NOT EXISTS selected_clients JSON AFTER target_type;

ALTER TABLE message_campaigns
ADD COLUMN IF NOT EXISTS total_targets INT DEFAULT 0 AFTER selected_clients;

-- Copiar dados do campo antigo para o novo (se o campo message_template existir)
UPDATE message_campaigns
SET message = message_template
WHERE message IS NULL AND message_template IS NOT NULL;

UPDATE message_campaigns
SET total_targets = total_count
WHERE total_targets = 0 AND total_count > 0;

-- Definir valores padrão para campos novos baseado nos antigos
UPDATE message_campaigns
SET target_type = CASE
  WHEN target_audience = 'all_clients' THEN 'all'
  WHEN target_audience IN ('birthday', 'inactive', 'custom') THEN 'specific'
  ELSE 'all'
END
WHERE target_type IS NULL;

-- Atualizar status para valores novos
UPDATE message_campaigns
SET status = CASE
  WHEN status = 'draft' THEN 'pending'
  WHEN status = 'active' THEN 'sending'
  WHEN status = 'paused' THEN 'pending'
  WHEN status = 'completed' THEN 'completed'
  ELSE status
END;

-- Modificar coluna status para remover ENUM
ALTER TABLE message_campaigns
MODIFY COLUMN status VARCHAR(50) NOT NULL DEFAULT 'pending';

-- Modificar coluna scheduled_date de DATE para DATETIME para incluir hora
ALTER TABLE message_campaigns
MODIFY COLUMN scheduled_date DATETIME NOT NULL;

-- Registrar esta migration
INSERT IGNORE INTO migrations (filename) VALUES ('019_update_message_campaigns.sql');
