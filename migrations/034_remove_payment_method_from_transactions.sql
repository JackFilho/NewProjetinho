-- Remove payment_method_id column from financial_transactions table
ALTER TABLE financial_transactions
DROP COLUMN payment_method_id;
