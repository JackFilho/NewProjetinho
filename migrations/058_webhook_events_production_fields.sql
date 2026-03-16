-- Migration 058: Expand webhook_events table for production-ready Meta webhook
-- Adds multi-tenant routing fields, headers persistence, processing lifecycle

ALTER TABLE webhook_events
  ADD COLUMN IF NOT EXISTS provider VARCHAR(50) NOT NULL DEFAULT 'meta_cloud_api',
  ADD COLUMN IF NOT EXISTS waba_id VARCHAR(100) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS phone_number_id VARCHAR(100) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS headers_json JSON DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS processing_status VARCHAR(30) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS processed_at TIMESTAMP DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS error_message TEXT DEFAULT NULL;

-- Index for multi-tenant lookups
CREATE INDEX IF NOT EXISTS idx_webhook_events_phone_number_id ON webhook_events(phone_number_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_waba_id ON webhook_events(waba_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_processing_status ON webhook_events(processing_status);
CREATE INDEX IF NOT EXISTS idx_webhook_events_company_id ON webhook_events(company_id);
