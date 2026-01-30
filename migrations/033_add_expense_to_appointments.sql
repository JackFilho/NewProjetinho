-- Add expense column to appointments table
ALTER TABLE appointments
ADD COLUMN expense DECIMAL(10, 2) DEFAULT 0.00 COMMENT 'Despesa/custo do serviço realizado';
