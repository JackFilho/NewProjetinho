-- Migration: Add Asaas payment gateway columns to companies table
-- Date: 2025-01-02
-- Description: Adds fields for Asaas payment gateway configuration

ALTER TABLE companies
ADD COLUMN asaas_api_key VARCHAR(255) NULL COMMENT 'Asaas payment gateway API key',
ADD COLUMN asaas_webhook_url VARCHAR(500) NULL COMMENT 'Asaas webhook URL (auto-generated)',
ADD COLUMN asaas_environment VARCHAR(20) DEFAULT 'sandbox' COMMENT 'Asaas environment (sandbox/production)',
ADD COLUMN asaas_enabled BOOLEAN DEFAULT FALSE COMMENT 'Whether Asaas integration is enabled';

-- Add indexes for better query performance
CREATE INDEX idx_companies_asaas_enabled ON companies(asaas_enabled);