-- Migration: 003_plans_system.sql
-- Description: Sistema de planos e assinaturas
-- Date: 2025-06-28

-- ================================================
-- SISTEMA DE PLANOS
-- ================================================

CREATE TABLE IF NOT EXISTS plans (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    annual_price DECIMAL(10,2),
    free_days INT DEFAULT 0,
    max_professionals INT DEFAULT 1,
    is_active TINYINT(1) DEFAULT 1,
    permissions JSON,
    stripe_product_id VARCHAR(255),
    stripe_price_id VARCHAR(255),
    stripe_annual_price_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_active (is_active),
    INDEX idx_stripe_product (stripe_product_id)
);

-- ================================================
-- PRODUTOS E CUPONS
-- ================================================

CREATE TABLE IF NOT EXISTS products (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    is_active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_active (is_active)
);

CREATE TABLE IF NOT EXISTS coupons (
    id INT PRIMARY KEY AUTO_INCREMENT,
    company_id INT,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) NOT NULL,
    description TEXT,
    discount_type VARCHAR(20) NOT NULL COMMENT 'percentage ou fixed',
    discount_value VARCHAR(20) NOT NULL,
    min_order_value DECIMAL(10,2),
    max_discount DECIMAL(10,2),
    usage_limit INT,
    used_count INT NOT NULL DEFAULT 0,
    valid_until DATE NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_company (company_id),
    INDEX idx_code (code),
    INDEX idx_active (is_active),
    INDEX idx_valid_until (valid_until),
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    UNIQUE KEY unique_company_code (company_id, code)
    is_active TINYINT(1) DEFAULT 1,
    min_order_value DECIMAL(10,2),
    max_discount DECIMAL(10,2),
    usage_limit INT,
    used_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_code (code),
    INDEX idx_company (company_id),
    INDEX idx_active (is_active)
);

-- ================================================
-- INSERÇÃO DE DADOS INICIAIS
-- ================================================

-- Planos padrão
INSERT INTO plans (name, price, annual_price, max_professionals, permissions) VALUES
('Básico', 29.90, 299.00, 1, '{"appointments": true, "clients": true, "services": true, "reports": false, "whatsapp": false, "professionals": false}'),
('Profissional', 49.90, 499.00, 3, '{"appointments": true, "clients": true, "services": true, "reports": true, "whatsapp": true, "professionals": true}'),
('Premium', 89.90, 899.00, 10, '{"appointments": true, "clients": true, "services": true, "reports": true, "whatsapp": true, "professionals": true, "analytics": true}')
ON DUPLICATE KEY UPDATE id=id;

-- Registrar esta migration
INSERT IGNORE INTO migrations (filename) VALUES ('003_plans_system.sql');