-- Remove n8n fields from whatsapp_instances
ALTER TABLE whatsapp_instances
DROP COLUMN IF EXISTS n8n_webhook_url,
DROP COLUMN IF EXISTS n8n_webhook_enabled;

-- Add n8n fields to companies table
ALTER TABLE companies
ADD COLUMN n8n_webhook_url VARCHAR(500) NULL
COMMENT 'URL do webhook n8n para notificações de agendamentos',
ADD COLUMN n8n_webhook_enabled BOOLEAN DEFAULT FALSE
COMMENT 'Se true, envia notificações de agendamentos para o webhook n8n';
