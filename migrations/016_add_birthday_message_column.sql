-- Migration: 016_add_birthday_message_column.sql
-- Description: Adicionar coluna birthday_message na tabela companies
-- Date: 2025-01-27

-- ================================================
-- ADICIONAR COLUNA BIRTHDAY_MESSAGE
-- ================================================

-- Adicionar coluna birthday_message na tabela companies
ALTER TABLE companies 
ADD COLUMN IF NOT EXISTS birthday_message TEXT DEFAULT NULL COMMENT 'Mensagem personalizada de aniversário da empresa';

-- Registrar migration
INSERT IGNORE INTO migrations (filename) VALUES ('016_add_birthday_message_column.sql');