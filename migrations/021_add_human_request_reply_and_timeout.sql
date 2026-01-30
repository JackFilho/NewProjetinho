-- Add reply message and timeout fields for human request

ALTER TABLE companies
ADD COLUMN human_request_reply_message TEXT DEFAULT NULL COMMENT 'Auto-reply message sent to client when human is requested';

ALTER TABLE companies
ADD COLUMN human_request_timeout INT NOT NULL DEFAULT 30 COMMENT 'Minutes of inactivity before AI resumes after human request (10, 20, 30, 60)';

-- Set default reply message for existing companies
UPDATE companies
SET human_request_reply_message = 'Obrigado por entrar em contato! Você foi encaminhado para um atendente humano. Aguarde, em breve você será atendido.'
WHERE human_request_reply_message IS NULL;

-- Set default timeout for existing companies
UPDATE companies
SET human_request_timeout = 30
WHERE human_request_timeout IS NULL;
