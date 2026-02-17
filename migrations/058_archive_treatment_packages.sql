-- Migration 058: Arquivamento de pacotes de tratamento
-- Pacotes concluídos/cancelados há mais de 3 meses serão arquivados automaticamente
-- Pacotes arquivados saem da listagem padrão, acessíveis via filtro

ALTER TABLE treatment_packages
  ADD COLUMN archived INT NOT NULL DEFAULT 0 COMMENT '0 = ativo, 1 = arquivado';

-- Índice para a query principal: pacotes não-arquivados de uma empresa
CREATE INDEX idx_pkg_archived ON treatment_packages(company_id, archived);

-- Índice para o scheduler de auto-arquivamento
CREATE INDEX idx_pkg_status_updated ON treatment_packages(status, updated_at);
