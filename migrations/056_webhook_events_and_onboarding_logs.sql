-- Migration 056: Create webhook_events and onboarding_logs tables
-- webhook_events: audit trail and idempotency for Meta webhooks
-- onboarding_logs: track Embedded Signup / Tech Provider onboarding steps

CREATE TABLE IF NOT EXISTS webhook_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT,
  instance_name VARCHAR(255) NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  message_id VARCHAR(255),
  payload JSON,
  processed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_webhook_events_instance (instance_name),
  INDEX idx_webhook_events_message_id (message_id),
  INDEX idx_webhook_events_created (created_at)
);

CREATE TABLE IF NOT EXISTS onboarding_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  step VARCHAR(100) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  details JSON,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_onboarding_company (company_id),
  INDEX idx_onboarding_step (step)
);
