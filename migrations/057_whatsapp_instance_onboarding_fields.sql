-- Migration 057: Add onboarding_mode and verified_name to whatsapp_instances
-- Tracks how each instance was onboarded (embedded_signup vs manual)

ALTER TABLE whatsapp_instances
  ADD COLUMN IF NOT EXISTS onboarding_mode VARCHAR(30) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS verified_name VARCHAR(255) DEFAULT NULL;
