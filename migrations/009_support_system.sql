-- Migration: 009_support_system.sql
-- Description: Sistema completo de suporte ao cliente
-- Date: 2025-01-27

-- ================================================
-- TIPOS DE TICKETS DE SUPORTE
-- ================================================

CREATE TABLE IF NOT EXISTS support_ticket_types (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_active (is_active)
);

-- ================================================
-- STATUS DOS TICKETS DE SUPORTE
-- ================================================

CREATE TABLE IF NOT EXISTS support_ticket_statuses (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    color VARCHAR(7) NOT NULL DEFAULT '#6b7280',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_active (is_active),
    INDEX idx_sort_order (sort_order)
);

-- ================================================
-- TICKETS DE SUPORTE
-- ================================================

CREATE TABLE IF NOT EXISTS support_tickets (
    id INT PRIMARY KEY AUTO_INCREMENT,
    company_id INT NOT NULL,
    type_id INT,
    status_id INT,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    priority VARCHAR(20) NOT NULL DEFAULT 'medium',
    category VARCHAR(100) NOT NULL DEFAULT 'general',
    admin_response TEXT,
    attachments TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP NULL,
    INDEX idx_company (company_id),
    INDEX idx_type (type_id),
    INDEX idx_status (status_id),
    INDEX idx_priority (priority),
    INDEX idx_category (category),
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    FOREIGN KEY (type_id) REFERENCES support_ticket_types(id) ON DELETE SET NULL,
    FOREIGN KEY (status_id) REFERENCES support_ticket_statuses(id) ON DELETE SET NULL
);

-- ================================================
-- DADOS INICIAIS
-- ================================================

-- Tipos de tickets padrão
INSERT INTO support_ticket_types (name, description) VALUES
('Técnico', 'Problemas técnicos e bugs do sistema'),
('Financeiro', 'Questões relacionadas a pagamentos e faturas'),
('Funcionalidade', 'Solicitações de novas funcionalidades'),
('Geral', 'Dúvidas gerais sobre o sistema'),
('Integração', 'Problemas com integrações (WhatsApp, Stripe, etc.)');

-- Status padrão dos tickets
INSERT INTO support_ticket_statuses (name, description, color, sort_order) VALUES
('Aberto', 'Ticket recém criado, aguardando análise', '#ef4444', 1),
('Em Análise', 'Ticket sendo analisado pela equipe', '#f59e0b', 2),
('Em Desenvolvimento', 'Solução sendo desenvolvida', '#3b82f6', 3),
('Aguardando Cliente', 'Aguardando resposta do cliente', '#8b5cf6', 4),
('Resolvido', 'Ticket resolvido com sucesso', '#10b981', 5),
('Fechado', 'Ticket fechado definitivamente', '#6b7280', 6);

-- Registrar migration
INSERT IGNORE INTO migrations (filename) VALUES ('009_support_system.sql');