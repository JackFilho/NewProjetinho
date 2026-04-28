-- Migration: 008_trial_expiration_system.sql
-- Description: Sistema de controle de expiração de período gratuito e alertas de pagamento
-- Date: 2025-06-28

-- ================================================
-- SISTEMA DE CONTROLE DE PERÍODO GRATUITO
-- ================================================

-- Adicionar colunas para controle de período gratuito na tabela companies
ALTER TABLE companies 
ADD COLUMN trial_expires_at DATETIME NULL COMMENT 'Data de expiração do período gratuito',
ADD COLUMN trial_alert_shown INT DEFAULT 0 COMMENT 'Controle de alertas mostrados (bitfield: 1=5dias, 2=4dias, 4=3dias, 8=2dias, 16=1dia)',
ADD COLUMN subscription_status ENUM('trial', 'active', 'expired', 'blocked') DEFAULT 'trial' COMMENT 'Status da assinatura';

-- Atualizar empresas existentes para definir data de expiração baseada na criação + dias grátis do plano
UPDATE companies c
INNER JOIN plans p ON c.plan_id = p.id
SET c.trial_expires_at = DATE_ADD(c.created_at, INTERVAL p.free_days DAY),
    c.subscription_status = CASE 
        WHEN c.stripe_subscription_id IS NOT NULL THEN 'active'
        WHEN DATE_ADD(c.created_at, INTERVAL p.free_days DAY) > NOW() THEN 'trial'
        WHEN DATE_ADD(c.created_at, INTERVAL p.free_days DAY) <= NOW() THEN 'expired'
        ELSE 'trial'
    END
WHERE c.trial_expires_at IS NULL;

-- Criar tabela para armazenar alertas de pagamento
CREATE TABLE IF NOT EXISTS payment_alerts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_id INT NOT NULL,
    alert_type ENUM('5_days', '4_days', '3_days', '2_days', '1_day', 'expired') NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    shown_at TIMESTAMP NULL,
    is_shown BOOLEAN DEFAULT FALSE,
    INDEX idx_company_alert (company_id, alert_type),
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB CHARSET=utf8mb4;

-- Criar índices para otimizar consultas de expiração
CREATE INDEX idx_companies_trial_expires ON companies(trial_expires_at);
CREATE INDEX idx_companies_subscription_status ON companies(subscription_status);

-- Inserir comentário na tabela de migrations (se existir)
INSERT IGNORE INTO migrations (filename) VALUES ('008_trial_expiration_system.sql');