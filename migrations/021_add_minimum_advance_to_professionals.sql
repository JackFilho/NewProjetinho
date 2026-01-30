-- Migration 021: Add minimum advance hours to professionals table
-- This allows each professional to set a minimum advance time for bookings
-- Example: If set to 2 hours, clients cannot book appointments less than 2 hours in advance

ALTER TABLE professionals
ADD COLUMN minimum_advance_hours INT NOT NULL DEFAULT 0 AFTER time_interval;

-- Default is 0 (no minimum advance required)
-- Common values:
--   0 = No advance required (can book immediately)
--   1 = 1 hour advance required
--   2 = 2 hours advance required
--   24 = 1 day advance required
--   48 = 2 days advance required

COMMIT;
