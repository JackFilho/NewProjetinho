-- Migration 021: Consolidate and ensure all Asaas fields exist
-- Date: 2025-10-24
-- Description: Ensures all Asaas-related fields exist in companies and appointments tables
--              This migration is safe to run multiple times (uses IF NOT EXISTS)

-- ============================================================================
-- COMPANIES TABLE - Asaas Integration Fields
-- ============================================================================

-- Configuration fields for Asaas integration
ALTER TABLE companies
ADD COLUMN IF NOT EXISTS asaas_api_key VARCHAR(255) NULL
COMMENT 'Asaas payment gateway API key (optional, can use global key)';

ALTER TABLE companies
ADD COLUMN IF NOT EXISTS asaas_webhook_url VARCHAR(500) NULL
COMMENT 'Asaas webhook URL for this company';

ALTER TABLE companies
ADD COLUMN IF NOT EXISTS asaas_environment VARCHAR(20) DEFAULT 'sandbox'
COMMENT 'Asaas environment: sandbox or production';

ALTER TABLE companies
ADD COLUMN IF NOT EXISTS asaas_enabled BOOLEAN DEFAULT FALSE
COMMENT 'Whether Asaas integration is enabled for this company';

-- Customer and subscription tracking
ALTER TABLE companies
ADD COLUMN IF NOT EXISTS asaas_customer_id VARCHAR(100) NULL
COMMENT 'Asaas customer ID for this company in the platform subscription';

ALTER TABLE companies
ADD COLUMN IF NOT EXISTS asaas_subscription_id VARCHAR(100) NULL
COMMENT 'Asaas subscription ID for this company platform subscription';

-- ============================================================================
-- APPOINTMENTS TABLE - Asaas Payment Fields
-- ============================================================================

-- Payment tracking for individual appointments
ALTER TABLE appointments
ADD COLUMN IF NOT EXISTS asaas_payment_id VARCHAR(255) NULL
COMMENT 'Asaas payment/charge ID for this appointment';

ALTER TABLE appointments
ADD COLUMN IF NOT EXISTS asaas_payment_status VARCHAR(50) NULL
COMMENT 'Asaas payment status: PENDING, CONFIRMED, RECEIVED, OVERDUE, REFUNDED, etc.';

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Drop existing indexes if they exist (to avoid errors on re-run)
DROP INDEX IF EXISTS idx_companies_asaas_enabled ON companies;
DROP INDEX IF EXISTS idx_companies_asaas_customer_id ON companies;
DROP INDEX IF EXISTS idx_companies_asaas_subscription_id ON companies;
DROP INDEX IF EXISTS idx_appointments_asaas_payment_id ON appointments;
DROP INDEX IF EXISTS idx_appointments_asaas_payment_status ON appointments;

-- Create indexes for better query performance (MySQL/MariaDB compatible)
CREATE INDEX idx_companies_asaas_enabled ON companies(asaas_enabled);

CREATE INDEX idx_companies_asaas_customer_id ON companies(asaas_customer_id);

CREATE INDEX idx_companies_asaas_subscription_id ON companies(asaas_subscription_id);

CREATE INDEX idx_appointments_asaas_payment_id ON appointments(asaas_payment_id);

CREATE INDEX idx_appointments_asaas_payment_status ON appointments(asaas_payment_status);

-- ============================================================================
-- VERIFICATION QUERIES (commented out - uncomment to verify)
-- ============================================================================

-- To verify companies table structure:
-- DESCRIBE companies;
-- SHOW INDEX FROM companies WHERE Key_name LIKE '%asaas%';

-- To verify appointments table structure:
-- DESCRIBE appointments;
-- SHOW INDEX FROM appointments WHERE Key_name LIKE '%asaas%';

-- To check existing data:
-- SELECT COUNT(*) as total_companies,
--        SUM(CASE WHEN asaas_enabled = TRUE THEN 1 ELSE 0 END) as asaas_enabled,
--        SUM(CASE WHEN asaas_customer_id IS NOT NULL THEN 1 ELSE 0 END) as has_customer_id,
--        SUM(CASE WHEN asaas_subscription_id IS NOT NULL THEN 1 ELSE 0 END) as has_subscription_id
-- FROM companies;
