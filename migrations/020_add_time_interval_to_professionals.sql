-- Migration: Add time_interval column to professionals table
-- This allows each professional to have a custom appointment time interval (in minutes)

ALTER TABLE professionals
ADD COLUMN time_interval INT NOT NULL DEFAULT 30 AFTER phone;

-- Default is 30 minutes, but can be changed to 60, 15, etc.
-- Examples: 15 = 09:00, 09:15, 09:30, 09:45
--           30 = 09:00, 09:30, 10:00, 10:30
--           60 = 09:00, 10:00, 11:00, 12:00
