-- Toggle para habilitar locais de atendimento por dia
ALTER TABLE companies ADD COLUMN enable_professional_locations TINYINT(1) NOT NULL DEFAULT 0;
