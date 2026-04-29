-- Migration: Allow multiple exceptional schedules on the same day
-- Remove the UNIQUE constraint so professionals can have multiple time windows on a single date

ALTER TABLE professional_exceptional_schedules
DROP INDEX unique_professional_exception_date;
