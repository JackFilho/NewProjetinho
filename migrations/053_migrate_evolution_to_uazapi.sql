-- Migration: Migrar Evolution API para UAZAPI
-- Renomeia colunas de configuração global e adiciona instance_token para autenticação por instância

-- Renomear colunas de configuração global
ALTER TABLE global_settings
  CHANGE COLUMN evolution_api_url uazapi_url VARCHAR(500),
  CHANGE COLUMN evolution_api_global_key uazapi_admin_token VARCHAR(500);

-- Adicionar coluna instance_token na tabela whatsapp_instances
-- Cada instância UAZAPI tem seu próprio token de autenticação
ALTER TABLE whatsapp_instances
  ADD COLUMN instance_token VARCHAR(500) AFTER instance_name;
