-- Migration 053: Add sex, guardian and occupation fields to clients table
-- Required for patient identification on anamnesis forms.

ALTER TABLE clients
  ADD COLUMN sex VARCHAR(20) DEFAULT NULL AFTER birth_date,
  ADD COLUMN guardian VARCHAR(255) DEFAULT NULL AFTER sex,
  ADD COLUMN occupation VARCHAR(255) DEFAULT NULL AFTER guardian;
