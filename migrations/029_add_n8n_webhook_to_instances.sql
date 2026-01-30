-- Add n8n webhook URL to whatsapp_instances
ALTER TABLE whatsapp_instances
ADD COLUMN n8n_webhook_url VARCHAR(500) NULL
COMMENT 'URL do webhook n8n para notificações de agendamentos';
