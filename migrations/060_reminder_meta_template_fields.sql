-- Add Meta template fields to reminder_settings for sending approved WhatsApp templates
ALTER TABLE reminder_settings
  ADD COLUMN use_meta_template TINYINT(1) DEFAULT 0 AFTER message_template,
  ADD COLUMN meta_template_name VARCHAR(255) DEFAULT NULL AFTER use_meta_template,
  ADD COLUMN meta_template_language VARCHAR(10) DEFAULT 'pt_BR' AFTER meta_template_name;
