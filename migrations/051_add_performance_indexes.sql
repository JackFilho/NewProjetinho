-- Migration 051: Add composite indexes for performance optimization
-- These indexes target the most frequent queries to avoid full table scans

-- Conflict check (most critical - runs on every appointment confirmation webhook)
CREATE INDEX IF NOT EXISTS idx_apt_company_date_prof_status
  ON appointments (company_id, appointment_date, professional_id, status);

-- Messages by conversation ordered by timestamp (debounce grouping, chat history)
CREATE INDEX IF NOT EXISTS idx_msg_conversation_timestamp
  ON messages (conversation_id, timestamp DESC);

-- Conversations by company ordered by last message (chat listing)
CREATE INDEX IF NOT EXISTS idx_conv_company_lastmsg
  ON conversations (company_id, last_message_at DESC);

-- Client duplicate check (runs on every client creation)
CREATE INDEX IF NOT EXISTS idx_client_company_phone
  ON clients (company_id, phone);

-- Reminder history queries by company and date
CREATE INDEX IF NOT EXISTS idx_reminder_company_sent
  ON reminder_history (company_id, sent_at);

CREATE INDEX IF NOT EXISTS idx_reminder_appointment
  ON reminder_history (appointment_id);

-- Birthday message history
CREATE INDEX IF NOT EXISTS idx_birthday_company_sent
  ON birthday_message_history (company_id, sent_at);

CREATE INDEX IF NOT EXISTS idx_birthday_client
  ON birthday_message_history (client_id);
