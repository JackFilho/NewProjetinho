-- Add human request fields to companies table

ALTER TABLE companies
ADD COLUMN human_request_enabled TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Enable/disable human request feature';

ALTER TABLE companies
ADD COLUMN human_request_contact VARCHAR(255) DEFAULT NULL COMMENT 'WhatsApp group ID or phone number to send notifications (e.g., 120363404730378309@g.us)';

ALTER TABLE companies
ADD COLUMN human_request_message TEXT DEFAULT NULL COMMENT 'Custom message to send to the contact when human is requested';

ALTER TABLE companies
ADD COLUMN human_request_keywords TEXT DEFAULT NULL COMMENT 'JSON array of keywords/phrases that trigger human request (e.g., ["falar com humano", "atendente", "pessoa"])';

-- Set default message for existing companies
UPDATE companies
SET human_request_message = 'Olá! Um cliente está solicitando atendimento humano.\n\n👤 Cliente: {clientName}\n📞 Telefone: {clientPhone}\n⏰ Horário: {time}\n\nPor favor, entre em contato o mais rápido possível.'
WHERE human_request_message IS NULL;

-- Set default keywords for existing companies
UPDATE companies
SET human_request_keywords = '["falar com humano", "falar com atendente", "falar com pessoa", "atendente humano", "quero falar com alguém", "preciso de um atendente", "atendimento humano"]'
WHERE human_request_keywords IS NULL;
