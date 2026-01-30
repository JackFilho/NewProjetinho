-- Migration: 010_tour_system.sql
-- Description: Sistema de tour guiado para novos usuários
-- Date: 2025-01-27

-- ================================================
-- PASSOS DO TOUR GUIADO
-- ================================================

CREATE TABLE IF NOT EXISTS tour_steps (
    id INT PRIMARY KEY AUTO_INCREMENT,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    target_element VARCHAR(255) NOT NULL COMMENT 'CSS selector do elemento alvo',
    placement VARCHAR(20) DEFAULT 'bottom' COMMENT 'Posição do tooltip: top, bottom, left, right',
    step_order INT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_step_order (step_order),
    INDEX idx_active (is_active)
);

-- ================================================
-- PROGRESSO DO TOUR POR EMPRESA
-- ================================================

CREATE TABLE IF NOT EXISTS company_tour_progress (
    id INT PRIMARY KEY AUTO_INCREMENT,
    company_id INT NOT NULL,
    has_completed_tour BOOLEAN DEFAULT FALSE,
    current_step INT DEFAULT 1,
    completed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_company (company_id),
    INDEX idx_completed (has_completed_tour),
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

-- ================================================
-- DADOS INICIAIS - PASSOS DO TOUR
-- ================================================

INSERT INTO tour_steps (title, description, target_element, placement, step_order) VALUES
('Bem-vindo ao Sistema!', 'Este é o seu painel principal onde você pode ver um resumo de todas as atividades da sua empresa.', '[data-tour="dashboard"]', 'bottom', 1),
('Menu de Navegação', 'Use este menu lateral para navegar entre as diferentes seções do sistema.', '[data-tour="sidebar"]', 'right', 2),
('Agendamentos', 'Aqui você pode visualizar e gerenciar todos os seus agendamentos.', '[data-tour="appointments"]', 'bottom', 3),
('Clientes', 'Gerencie sua base de clientes, adicione novos e visualize histórico.', '[data-tour="clients"]', 'bottom', 4),
('Serviços', 'Configure os serviços que sua empresa oferece, preços e durações.', '[data-tour="services"]', 'bottom', 5),
('Profissionais', 'Adicione e gerencie os profissionais da sua equipe.', '[data-tour="professionals"]', 'bottom', 6),
('Relatórios', 'Visualize relatórios detalhados sobre o desempenho do seu negócio.', '[data-tour="reports"]', 'bottom', 7),
('Configurações', 'Personalize as configurações do sistema de acordo com suas necessidades.', '[data-tour="settings"]', 'bottom', 8),
('Suporte', 'Precisa de ajuda? Use nossa central de suporte para tirar dúvidas.', '[data-tour="support"]', 'bottom', 9),
('Tour Concluído!', 'Parabéns! Você concluiu o tour. Agora você está pronto para usar o sistema.', '[data-tour="complete"]', 'center', 10);

-- Adicionar coluna tour_color na tabela companies se não existir
ALTER TABLE companies 
ADD COLUMN IF NOT EXISTS tour_color VARCHAR(7) DEFAULT '#a855f7' COMMENT 'Cor personalizada do tour para a empresa';

-- Registrar migration
INSERT IGNORE INTO migrations (filename) VALUES ('010_tour_system.sql');