-- Remove type column from financial_categories as it's already defined in transactions
ALTER TABLE financial_categories
DROP COLUMN type;
