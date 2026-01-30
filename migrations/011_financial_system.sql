-- Migration: 011_financial_system.sql
-- Description: Sistema completo de gestão financeira
-- Date: 2025-01-27

-- ================================================
-- CATEGORIAS FINANCEIRAS
-- ================================================

CREATE TABLE IF NOT EXISTS financial_categories (
    id INT PRIMARY KEY AUTO_INCREMENT,
    company_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    type VARCHAR(20) NOT NULL COMMENT 'income ou expense',
    color VARCHAR(7) NOT NULL DEFAULT '#3B82F6',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_company (company_id),
    INDEX idx_type (type),
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

-- ================================================
-- MÉTODOS DE PAGAMENTO
-- ================================================

CREATE TABLE IF NOT EXISTS payment_methods (
    id INT PRIMARY KEY AUTO_INCREMENT,
    company_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    type VARCHAR(20) NOT NULL COMMENT 'cash, card, pix, transfer, other',
    is_active INT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_company (company_id),
    INDEX idx_type (type),
    INDEX idx_active (is_active),
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

-- ================================================
-- TRANSAÇÕES FINANCEIRAS
-- ================================================

CREATE TABLE IF NOT EXISTS financial_transactions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    company_id INT NOT NULL,
    description VARCHAR(500) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    type VARCHAR(20) NOT NULL COMMENT 'income ou expense',
    category_id INT NOT NULL,
    payment_method_id INT NOT NULL,
    date DATE NOT NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_company (company_id),
    INDEX idx_type (type),
    INDEX idx_date (date),
    INDEX idx_category (category_id),
    INDEX idx_payment_method (payment_method_id),
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES financial_categories(id) ON DELETE RESTRICT,
    FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id) ON DELETE RESTRICT
);

-- ================================================
-- DADOS INICIAIS
-- ================================================

-- Função para inserir categorias padrão para cada empresa
-- Nota: Este INSERT será executado via trigger ou script separado para empresas existentes

-- Categorias de receita padrão (serão inseridas para cada empresa via código)
-- - Serviços Prestados
-- - Produtos Vendidos
-- - Outras Receitas

-- Categorias de despesa padrão (serão inseridas para cada empresa via código)
-- - Aluguel
-- - Salários
-- - Marketing
-- - Materiais
-- - Outras Despesas

-- Métodos de pagamento padrão (serão inseridos para cada empresa via código)
-- - Dinheiro
-- - Cartão de Débito
-- - Cartão de Crédito
-- - PIX
-- - Transferência Bancária

-- Registrar migration
INSERT IGNORE INTO migrations (filename) VALUES ('011_financial_system.sql');