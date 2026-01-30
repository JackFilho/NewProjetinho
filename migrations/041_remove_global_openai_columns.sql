-- Remove OpenAI configuration columns from global_settings table
-- These configurations are now per-company instead of global

ALTER TABLE global_settings
DROP COLUMN IF EXISTS openai_api_key,
DROP COLUMN IF EXISTS openai_model,
DROP COLUMN IF EXISTS openai_temperature,
DROP COLUMN IF EXISTS openai_max_tokens;

-- Note: default_ai_prompt is kept as it's used as the default prompt for new companies
