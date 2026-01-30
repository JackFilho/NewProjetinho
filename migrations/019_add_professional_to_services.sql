-- Migration: Add professional_id column to services table
-- This allows services to be associated with specific professionals

ALTER TABLE services
ADD COLUMN professional_id INT NULL AFTER company_id,
ADD INDEX idx_professional_id (professional_id);

-- Add foreign key constraint
ALTER TABLE services
ADD CONSTRAINT fk_services_professional
FOREIGN KEY (professional_id) REFERENCES professionals(id) ON DELETE SET NULL;

-- Note: NULL professional_id means service is available to all professionals
