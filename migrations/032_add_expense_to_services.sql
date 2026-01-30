-- Add expense column to services table
ALTER TABLE services
ADD COLUMN expense DECIMAL(10, 2) DEFAULT 0.00 COMMENT 'Despesa/custo associado ao serviço';
