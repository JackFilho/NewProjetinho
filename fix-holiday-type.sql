-- FIX: Adicionar suporte ao tipo 'holiday' na tabela admin_alerts
-- Execute este script no seu cliente MySQL (Workbench, phpMyAdmin, ou linha de comando)

-- Verificar a estrutura atual da coluna
SHOW COLUMNS FROM admin_alerts LIKE 'type';

-- Opção 1: Se a coluna for ENUM, adicione 'holiday' ao ENUM
ALTER TABLE admin_alerts
MODIFY COLUMN type ENUM('info', 'warning', 'success', 'error', 'holiday') NOT NULL DEFAULT 'info';

-- Opção 2: Se a Opção 1 falhar, converta para VARCHAR
-- ALTER TABLE admin_alerts
-- MODIFY COLUMN type VARCHAR(50) NOT NULL DEFAULT 'info';

-- Verificar que a mudança funcionou
SHOW COLUMNS FROM admin_alerts LIKE 'type';

-- Opcional: Atualizar alertas existentes com type vazio para 'info'
UPDATE admin_alerts SET type = 'info' WHERE type = '' OR type IS NULL;
