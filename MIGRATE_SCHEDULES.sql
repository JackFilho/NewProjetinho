-- =========================================================================
-- SCRIPT DE MIGRAÇÃO COMPLETA - Sistema de Horários Individuais por Dia
-- =========================================================================
-- Execute este script no seu banco de dados MySQL via phpMyAdmin ou cliente MySQL
--
-- Este script irá:
-- 1. Criar a tabela professional_schedules (se não existir)
-- 2. Migrar os dados existentes de profissionais para o novo sistema
-- =========================================================================

-- PASSO 1: Criar tabela professional_schedules
-- =========================================================================
CREATE TABLE IF NOT EXISTS professional_schedules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  professional_id INT NOT NULL,
  day_of_week INT NOT NULL COMMENT '0=Domingo, 1=Segunda, 2=Terça, 3=Quarta, 4=Quinta, 5=Sexta, 6=Sábado',
  start_time VARCHAR(10) NOT NULL COMMENT 'Formato HH:MM (ex: 09:00)',
  end_time VARCHAR(10) NOT NULL COMMENT 'Formato HH:MM (ex: 18:00)',
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  FOREIGN KEY (professional_id) REFERENCES professionals(id) ON DELETE CASCADE,
  UNIQUE KEY unique_professional_day (professional_id, day_of_week)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Criar índice para consultas rápidas
CREATE INDEX IF NOT EXISTS idx_professional_id ON professional_schedules(professional_id);

SELECT 'Tabela professional_schedules criada com sucesso!' AS status;

-- =========================================================================
-- PASSO 2: Migrar dados existentes
-- =========================================================================

-- Para o profissional João Silva (ID 3) que tem:
-- work_start_time: 09:00
-- work_end_time: 18:00
-- work_days: NULL (será convertido para Segunda a Sábado)

-- Verificar se já existem horários para evitar duplicação
SELECT
  CASE
    WHEN COUNT(*) > 0 THEN 'AVISO: Já existem horários cadastrados!'
    ELSE 'OK: Pronto para migrar'
  END AS status,
  COUNT(*) as horarios_existentes
FROM professional_schedules
WHERE professional_id = 3;

-- Inserir horários apenas se não existirem
-- Segunda-feira (1)
INSERT IGNORE INTO professional_schedules
  (professional_id, day_of_week, start_time, end_time, is_enabled, created_at, updated_at)
VALUES
  (3, 1, '09:00', '18:00', 1, NOW(), NOW());

-- Terça-feira (2)
INSERT IGNORE INTO professional_schedules
  (professional_id, day_of_week, start_time, end_time, is_enabled, created_at, updated_at)
VALUES
  (3, 2, '09:00', '18:00', 1, NOW(), NOW());

-- Quarta-feira (3)
INSERT IGNORE INTO professional_schedules
  (professional_id, day_of_week, start_time, end_time, is_enabled, created_at, updated_at)
VALUES
  (3, 3, '09:00', '18:00', 1, NOW(), NOW());

-- Quinta-feira (4)
INSERT IGNORE INTO professional_schedules
  (professional_id, day_of_week, start_time, end_time, is_enabled, created_at, updated_at)
VALUES
  (3, 4, '09:00', '18:00', 1, NOW(), NOW());

-- Sexta-feira (5)
INSERT IGNORE INTO professional_schedules
  (professional_id, day_of_week, start_time, end_time, is_enabled, created_at, updated_at)
VALUES
  (3, 5, '09:00', '18:00', 1, NOW(), NOW());

-- Sábado (6)
INSERT IGNORE INTO professional_schedules
  (professional_id, day_of_week, start_time, end_time, is_enabled, created_at, updated_at)
VALUES
  (3, 6, '09:00', '18:00', 1, NOW(), NOW());

-- =========================================================================
-- PASSO 3: Verificar resultados
-- =========================================================================

SELECT '=== RESULTADO DA MIGRAÇÃO ===' AS '';

-- Mostrar horários criados
SELECT
  ps.id,
  p.name AS profissional,
  CASE ps.day_of_week
    WHEN 0 THEN 'Domingo'
    WHEN 1 THEN 'Segunda-feira'
    WHEN 2 THEN 'Terça-feira'
    WHEN 3 THEN 'Quarta-feira'
    WHEN 4 THEN 'Quinta-feira'
    WHEN 5 THEN 'Sexta-feira'
    WHEN 6 THEN 'Sábado'
  END AS dia_semana,
  ps.start_time AS inicio,
  ps.end_time AS fim,
  CASE ps.is_enabled
    WHEN 1 THEN 'Sim'
    ELSE 'Não'
  END AS ativo
FROM professional_schedules ps
JOIN professionals p ON ps.professional_id = p.id
WHERE ps.professional_id = 3
ORDER BY ps.day_of_week;

-- Resumo
SELECT
  COUNT(*) AS total_horarios_criados,
  'João Silva' AS para_profissional
FROM professional_schedules
WHERE professional_id = 3;

SELECT '=== MIGRAÇÃO CONCLUÍDA! ===' AS '';

-- =========================================================================
-- OBSERVAÇÕES IMPORTANTES:
-- =========================================================================
--
-- 1. Este script migra APENAS o profissional João Silva (ID 3)
--
-- 2. Se você tiver MAIS profissionais, você pode:
--    a) Copiar e colar as linhas INSERT mudando o ID
--    b) OU executar a migração automática via sistema depois que o servidor estiver rodando
--
-- 3. Os horários padrão são Segunda a Sábado, 09:00-18:00
--    Você pode alterar cada dia depois via sistema
--
-- 4. IMPORTANTE: Depois de executar este script, você DEVE fazer o deploy
--    do código atualizado para que o sistema use a nova tabela
--
-- =========================================================================
