-- Migrate global OpenAI settings to all existing companies
-- This copies the current global OpenAI configuration to each company

UPDATE companies c
CROSS JOIN global_settings g
SET
  c.openai_api_key = g.openai_api_key,
  c.openai_model = g.openai_model,
  c.openai_temperature = CAST(g.openai_temperature AS DECIMAL(3,2)),
  c.openai_max_tokens = CAST(g.openai_max_tokens AS SIGNED)
WHERE g.id = 1;
