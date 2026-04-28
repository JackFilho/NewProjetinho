-- Migration 019: Remove Stripe columns from companies and plans tables
-- Description: Remove all Stripe-related columns as we're migrating to Asaas payment provider

-- Remove Stripe columns from companies table
ALTER TABLE companies
DROP COLUMN IF EXISTS stripe_customer_id,
DROP COLUMN IF EXISTS stripe_subscription_id;

-- Remove Stripe columns from plans table
ALTER TABLE plans
DROP COLUMN IF EXISTS stripe_product_id,
DROP COLUMN IF EXISTS stripe_price_id;

-- Note: No rollback provided as this is a one-way migration to Asaas
