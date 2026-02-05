-- Migration: Alterar campo minimum_advance_hours para DECIMAL
-- Permite valores como 0.5 (30 minutos)

ALTER TABLE professionals
MODIFY COLUMN minimum_advance_hours DECIMAL(4,2) NOT NULL DEFAULT 0.00;

-- Valores comuns:
--   0 = Sem antecedência
--   0.5 = 30 minutos
--   1 = 1 hora
--   2 = 2 horas
--   24 = 1 dia
--   48 = 2 dias
