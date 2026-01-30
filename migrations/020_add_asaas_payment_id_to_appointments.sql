-- Migration: Add Asaas payment ID to appointments table
-- Date: 2025-01-02
-- Description: Adds field to track Asaas payment link ID for appointments

ALTER TABLE appointments
ADD COLUMN asaas_payment_id VARCHAR(255) NULL COMMENT 'Asaas payment link ID',
ADD COLUMN asaas_payment_status VARCHAR(50) NULL COMMENT 'Asaas payment status';

-- Add index for better query performance
CREATE INDEX idx_appointments_asaas_payment_id ON appointments(asaas_payment_id);