-- Migration 054: Add missing composite indexes for performance optimization
-- Targets queries identified in the full performance audit

-- Appointments by phone + company (follow-up suppression, client appointment lookups)
-- Avoids full table scan when checking if client has future appointments
CREATE INDEX IF NOT EXISTS idx_apt_phone_company_date
  ON appointments (client_phone, company_id, appointment_date);

-- Appointments by professional + date (conflict checking, availability queries)
-- Covers the frequent pattern: WHERE professional_id = ? AND appointment_date = ?
CREATE INDEX IF NOT EXISTS idx_apt_professional_date_status
  ON appointments (professional_id, appointment_date, status);

-- Appointments date + status (reminder-scheduler, bulk status updates)
-- Covers: WHERE appointment_date >= ? AND status IN (...)
CREATE INDEX IF NOT EXISTS idx_apt_date_status
  ON appointments (appointment_date, status);

-- Messages by conversation + role (frequent pattern in AI chat processing)
-- Covers: WHERE conversation_id = ? AND role = 'assistant' ORDER BY timestamp DESC
CREATE INDEX IF NOT EXISTS idx_msg_conversation_role
  ON messages (conversation_id, role);

-- Conversations by company + phone (WhatsApp webhook phone lookup)
CREATE INDEX IF NOT EXISTS idx_conv_company_phone
  ON conversations (company_id, phone_number);

-- Companies plan_status (admin dashboard count queries)
CREATE INDEX IF NOT EXISTS idx_company_plan_status
  ON companies (plan_status);

-- Companies subscription_status (subscription middleware check)
CREATE INDEX IF NOT EXISTS idx_company_subscription_status
  ON companies (subscription_status);

-- Support tickets ordered by date (admin listing without LIMIT)
CREATE INDEX IF NOT EXISTS idx_support_tickets_created
  ON support_tickets (created_at DESC);

-- Payment alerts by company + type + date (subscription middleware duplicate check)
-- NOTE: Only run this if payment_alerts table exists (created by migration 008)
-- CREATE INDEX IF NOT EXISTS idx_payment_alerts_company_type_date
--   ON payment_alerts (company_id, alert_type, created_at);
