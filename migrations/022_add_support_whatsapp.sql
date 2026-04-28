-- Migration: Add support_whatsapp column to global_settings table
-- Date: 2025-10-25
-- Description: Adds a column to store the support WhatsApp number in the global settings

ALTER TABLE global_settings
ADD COLUMN support_whatsapp VARCHAR(20) NULL AFTER system_url;
