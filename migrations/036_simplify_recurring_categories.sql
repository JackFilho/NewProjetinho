-- Remove only recurring_amount column from financial_categories (keep recurring_day as optional)
ALTER TABLE financial_categories
DROP COLUMN recurring_amount;
