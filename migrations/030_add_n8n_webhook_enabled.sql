-- Add enabled flag for n8n webhook
ALTER TABLE whatsapp_instances
ADD COLUMN n8n_webhook_enabled BOOLEAN DEFAULT FALSE
COMMENT 'Se true, envia notificações de agendamentos para o webhook n8n';
