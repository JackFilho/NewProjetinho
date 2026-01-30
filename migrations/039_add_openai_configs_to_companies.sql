-- Add OpenAI configuration columns to companies table
-- Each company can now have its own OpenAI API key and settings

ALTER TABLE companies
ADD COLUMN openai_api_key VARCHAR(255) NULL COMMENT 'OpenAI API key for this company',
ADD COLUMN openai_model VARCHAR(100) DEFAULT 'gpt-4o-mini' COMMENT 'OpenAI model to use (gpt-4o-mini, gpt-4o, etc)',
ADD COLUMN openai_temperature DECIMAL(3,2) DEFAULT 0.70 COMMENT 'Temperature for AI responses (0.0 - 2.0)',
ADD COLUMN openai_max_tokens INT DEFAULT 180 COMMENT 'Maximum tokens for AI responses';
