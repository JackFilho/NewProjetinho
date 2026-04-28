-- Migration 020: Add asaas_customer_id and asaas_subscription_id columns to companies table
-- Description: Add columns to store Asaas customer ID and subscription ID for payment integration

-- Add asaas_customer_id if it doesn't exist
ALTER TABLE companies
ADD COLUMN IF NOT EXISTS asaas_customer_id VARCHAR(100) AFTER asaas_enabled;

-- Add asaas_subscription_id if it doesn't exist
ALTER TABLE companies
ADD COLUMN IF NOT EXISTS asaas_subscription_id VARCHAR(100) AFTER asaas_customer_id;
