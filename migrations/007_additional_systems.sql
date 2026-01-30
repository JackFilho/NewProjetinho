-- Migration: 007_additional_systems.sql
-- Description: Sistemas adicionais - afiliados, suporte, tour, avaliações
-- Date: 2025-06-28

-- ================================================
-- SISTEMA DE AFILIADOS
-- ================================================

CREATE TABLE IF NOT EXISTS affiliates (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    affiliate_code VARCHAR(50) NOT NULL UNIQUE,
    commission_rate DECIMAL(5,2) DEFAULT 10.00,
    total_referrals INT DEFAULT 0,
    total_commissions DECIMAL(10,2) DEFAULT 0.00,
    is_active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_email (email),
    INDEX idx_affiliate_code (affiliate_code),
    INDEX idx_active (is_active)
);

CREATE TABLE IF NOT EXISTS affiliate_referrals (
    id INT PRIMARY KEY AUTO_INCREMENT,
    affiliate_id INT NOT NULL,
    company_id INT NOT NULL,
    referral_date DATE NOT NULL,
    plan_value DECIMAL(10,2) NOT NULL,
    commission_amount DECIMAL(10,2) NOT NULL,
    status ENUM('pending', 'approved', 'paid') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_affiliate (affiliate_id),
    INDEX idx_company (company_id),
    INDEX idx_status (status),
    FOREIGN KEY (affiliate_id) REFERENCES affiliates(id) ON DELETE CASCADE,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS affiliate_commissions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    affiliate_id INT NOT NULL,
    referral_id INT NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    payment_date DATE,
    status ENUM('pending', 'paid') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_affiliate (affiliate_id),
    INDEX idx_referral (referral_id),
    INDEX idx_status (status),
    FOREIGN KEY (affiliate_id) REFERENCES affiliates(id) ON DELETE CASCADE,
    FOREIGN KEY (referral_id) REFERENCES affiliate_referrals(id) ON DELETE CASCADE
);

-- ================================================
-- SISTEMA DE SUPORTE
-- ================================================

CREATE TABLE IF NOT EXISTS support_ticket_types (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS support_ticket_status (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    color VARCHAR(7) NOT NULL,
    is_default TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS support_tickets (
    id INT PRIMARY KEY AUTO_INCREMENT,
    company_id INT NOT NULL,
    type_id INT NOT NULL,
    status_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    priority ENUM('low', 'medium', 'high', 'urgent') DEFAULT 'medium',
    category VARCHAR(100),
    admin_response TEXT,
    attachments JSON,
    resolved_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_company (company_id),
    INDEX idx_type (type_id),
    INDEX idx_status (status_id),
    INDEX idx_priority (priority),
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    FOREIGN KEY (type_id) REFERENCES support_ticket_types(id),
    FOREIGN KEY (status_id) REFERENCES support_ticket_status(id)
);

-- ================================================
-- SISTEMA DE TOUR GUIADO
-- ================================================

CREATE TABLE IF NOT EXISTS tour_steps (
    id INT PRIMARY KEY AUTO_INCREMENT,
    step_number INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    target_element VARCHAR(255) NOT NULL,
    position ENUM('top', 'bottom', 'left', 'right') DEFAULT 'bottom',
    is_active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_step_number (step_number),
    INDEX idx_active (is_active)
);

CREATE TABLE IF NOT EXISTS company_tour_progress (
    id INT PRIMARY KEY AUTO_INCREMENT,
    company_id INT NOT NULL,
    completed_steps JSON,
    is_completed TINYINT(1) DEFAULT 0,
    completed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_company (company_id),
    INDEX idx_completed (is_completed),
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

-- ================================================
-- SISTEMA DE AVALIAÇÕES
-- ================================================

CREATE TABLE IF NOT EXISTS professional_reviews (
    id INT PRIMARY KEY AUTO_INCREMENT,
    company_id INT NOT NULL,
    professional_id INT NOT NULL,
    client_name VARCHAR(255) NOT NULL,
    client_phone VARCHAR(20),
    rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    appointment_id INT,
    is_public TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_company (company_id),
    INDEX idx_professional (professional_id),
    INDEX idx_rating (rating),
    INDEX idx_public (is_public),
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    FOREIGN KEY (professional_id) REFERENCES professionals(id) ON DELETE CASCADE,
    FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS review_invitations (
    id INT PRIMARY KEY AUTO_INCREMENT,
    company_id INT NOT NULL,
    appointment_id INT NOT NULL,
    client_phone VARCHAR(20) NOT NULL,
    client_name VARCHAR(255) NOT NULL,
    invitation_token VARCHAR(255) NOT NULL UNIQUE,
    status ENUM('pending', 'sent', 'completed', 'expired') DEFAULT 'pending',
    sent_at TIMESTAMP NULL,
    completed_at TIMESTAMP NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_company (company_id),
    INDEX idx_appointment (appointment_id),
    INDEX idx_token (invitation_token),
    INDEX idx_status (status),
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE
);

-- ================================================
-- INSERÇÃO DE DADOS INICIAIS
-- ================================================

-- Tipos de ticket de suporte
INSERT INTO support_ticket_types (name, description) VALUES
('Técnico', 'Problemas técnicos com o sistema'),
('Financeiro', 'Questões relacionadas a pagamentos e faturas'),
('Dúvida', 'Dúvidas sobre funcionalidades'),
('Sugestão', 'Sugestões de melhorias'),
('Bug', 'Relato de erros no sistema')
ON DUPLICATE KEY UPDATE id=id;

-- Status de tickets de suporte
INSERT INTO support_ticket_status (name, color, is_default) VALUES
('Aberto', '#FFA500', 1),
('Em Andamento', '#007BFF', 0),
('Resolvido', '#28A745', 0),
('Fechado', '#6C757D', 0)
ON DUPLICATE KEY UPDATE id=id;

-- Passos do tour guiado
INSERT INTO tour_steps (step_number, title, description, target_element, position) VALUES
(1, 'Bem-vindo ao Dashboard!', 'Este é o painel principal onde você pode ver todas as informações importantes da sua empresa.', '.dashboard-header', 'bottom'),
(2, 'Menu de Agendamentos', 'Aqui você pode gerenciar todos os seus agendamentos e visualizar o calendário.', 'a[href="/dashboard-appointments"]', 'right'),
(3, 'Gerenciar Serviços', 'Configure os serviços oferecidos pela sua empresa com preços e duração.', 'a[href="/dashboard-services"]', 'right'),
(4, 'Configurações', 'Personalize as configurações da sua empresa e integre com WhatsApp e outros serviços.', 'a[href="/dashboard-settings"]', 'right'),
(5, 'Suporte', 'Precisa de ajuda? Acesse nossa central de suporte para tirar dúvidas.', 'a[href="/dashboard-support"]', 'right')
ON DUPLICATE KEY UPDATE step_number=step_number;

-- Status padrão criados na migration 005

-- Registrar esta migration
INSERT IGNORE INTO migrations (filename) VALUES ('007_additional_systems.sql');