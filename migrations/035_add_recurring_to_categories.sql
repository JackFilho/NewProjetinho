-- Add recurring fields to financial_categories table
ALTER TABLE financial_categories
ADD COLUMN is_recurring INT DEFAULT 0 COMMENT 'Indica se é uma categoria com dívida recorrente (0=não, 1=sim)',
ADD COLUMN recurring_day INT COMMENT 'Dia do mês para lançar a transação recorrente (1-31)',
ADD COLUMN recurring_amount DECIMAL(10, 2) COMMENT 'Valor fixo da transação recorrente';
