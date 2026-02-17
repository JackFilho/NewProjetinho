-- =====================================================
-- 054: Seed default anamnesis templates for all specialties
-- System defaults (company_id = NULL) so every company
-- has at least one template available per specialty.
-- =====================================================

-- =============================================
-- 1. FISIOTERAPIA (Physiotherapy)
-- =============================================
INSERT INTO anamnesis_templates (company_id, specialty, name, description, is_active, created_at, updated_at)
VALUES (NULL, 'fisioterapia', 'Anamnese Fisioterapia - Geral', 'Ficha de anamnese padrao para avaliacao fisioterapeutica geral.', 1, NOW(), NOW());

SET @tpl_fisio = LAST_INSERT_ID();

INSERT INTO anamnesis_template_fields (template_id, section, label, field_type, options, is_required, sort_order, placeholder, created_at, updated_at) VALUES
(@tpl_fisio, 'Queixa Principal', 'Qual a queixa principal?', 'textarea', NULL, 1, 1, 'Descreva o motivo da consulta...', NOW(), NOW()),
(@tpl_fisio, 'Queixa Principal', 'Ha quanto tempo apresenta essa queixa?', 'text', NULL, 1, 2, 'Ex: 3 meses, 1 ano...', NOW(), NOW()),
(@tpl_fisio, 'Queixa Principal', 'Localizacao da dor/desconforto', 'text', NULL, 1, 3, 'Ex: Ombro direito, lombar...', NOW(), NOW()),
(@tpl_fisio, 'Queixa Principal', 'Intensidade da dor (0 a 10)', 'number', NULL, 0, 4, '0 = sem dor, 10 = pior dor', NOW(), NOW()),
(@tpl_fisio, 'Queixa Principal', 'Tipo de dor', 'select', '["Aguda","Cronica","Intermitente","Constante","Pontada","Queimacao","Latejante"]', 0, 5, NULL, NOW(), NOW()),
(@tpl_fisio, 'Queixa Principal', 'O que piora a dor?', 'textarea', NULL, 0, 6, 'Movimentos, posturas, atividades...', NOW(), NOW()),
(@tpl_fisio, 'Queixa Principal', 'O que melhora a dor?', 'textarea', NULL, 0, 7, 'Repouso, medicacao, calor...', NOW(), NOW()),
(@tpl_fisio, 'Historico de Saude', 'Possui alguma doenca diagnosticada?', 'textarea', NULL, 0, 8, 'Diabetes, hipertensao, artrite...', NOW(), NOW()),
(@tpl_fisio, 'Historico de Saude', 'Ja realizou cirurgias?', 'boolean', NULL, 0, 9, NULL, NOW(), NOW()),
(@tpl_fisio, 'Historico de Saude', 'Se sim, quais cirurgias?', 'textarea', NULL, 0, 10, 'Descreva as cirurgias realizadas...', NOW(), NOW()),
(@tpl_fisio, 'Historico de Saude', 'Medicamentos em uso', 'textarea', NULL, 0, 11, 'Liste os medicamentos que utiliza atualmente...', NOW(), NOW()),
(@tpl_fisio, 'Historico de Saude', 'Possui alguma alergia?', 'text', NULL, 0, 12, 'Medicamentos, alimentos, latex...', NOW(), NOW()),
(@tpl_fisio, 'Historico de Saude', 'Ja realizou fisioterapia anteriormente?', 'boolean', NULL, 0, 13, NULL, NOW(), NOW()),
(@tpl_fisio, 'Historico de Saude', 'Possui exames de imagem recentes?', 'boolean', NULL, 0, 14, NULL, NOW(), NOW()),
(@tpl_fisio, 'Habitos de Vida', 'Pratica atividade fisica?', 'boolean', NULL, 0, 15, NULL, NOW(), NOW()),
(@tpl_fisio, 'Habitos de Vida', 'Se sim, qual atividade e frequencia?', 'text', NULL, 0, 16, 'Ex: Caminhada 3x por semana...', NOW(), NOW()),
(@tpl_fisio, 'Habitos de Vida', 'Profissao/Atividade ocupacional', 'text', NULL, 0, 17, 'Descreva sua atividade de trabalho...', NOW(), NOW()),
(@tpl_fisio, 'Habitos de Vida', 'Tabagismo', 'boolean', NULL, 0, 18, NULL, NOW(), NOW()),
(@tpl_fisio, 'Habitos de Vida', 'Etilismo', 'boolean', NULL, 0, 19, NULL, NOW(), NOW()),
(@tpl_fisio, 'Habitos de Vida', 'Qualidade do sono', 'select', '["Boa","Regular","Ruim","Insonia"]', 0, 20, NULL, NOW(), NOW()),
(@tpl_fisio, 'Avaliacao Funcional', 'Limitacoes nas atividades diarias', 'checkbox', '["Vestir-se","Tomar banho","Cozinhar","Trabalhar","Dirigir","Subir escadas","Carregar peso","Dormir"]', 0, 21, NULL, NOW(), NOW()),
(@tpl_fisio, 'Avaliacao Funcional', 'Objetivo com o tratamento', 'textarea', NULL, 0, 22, 'O que espera alcançar com a fisioterapia?', NOW(), NOW());

-- =============================================
-- 2. ODONTOLOGIA (Dentistry)
-- =============================================
INSERT INTO anamnesis_templates (company_id, specialty, name, description, is_active, created_at, updated_at)
VALUES (NULL, 'odontologia', 'Anamnese Odontologica - Geral', 'Ficha de anamnese padrao para avaliacao odontologica.', 1, NOW(), NOW());

SET @tpl_odonto = LAST_INSERT_ID();

INSERT INTO anamnesis_template_fields (template_id, section, label, field_type, options, is_required, sort_order, placeholder, created_at, updated_at) VALUES
(@tpl_odonto, 'Queixa Principal', 'Qual o motivo da consulta?', 'textarea', NULL, 1, 1, 'Descreva o motivo da sua visita...', NOW(), NOW()),
(@tpl_odonto, 'Queixa Principal', 'Sente dor atualmente?', 'boolean', NULL, 0, 2, NULL, NOW(), NOW()),
(@tpl_odonto, 'Queixa Principal', 'Localizacao da dor', 'text', NULL, 0, 3, 'Qual dente ou regiao?', NOW(), NOW()),
(@tpl_odonto, 'Queixa Principal', 'Sangramento gengival', 'boolean', NULL, 0, 4, NULL, NOW(), NOW()),
(@tpl_odonto, 'Queixa Principal', 'Sensibilidade nos dentes', 'select', '["Nenhuma","Ao frio","Ao calor","Ao doce","Ao morder","Constante"]', 0, 5, NULL, NOW(), NOW()),
(@tpl_odonto, 'Historico Odontologico', 'Ultima visita ao dentista', 'text', NULL, 0, 6, 'Ha quanto tempo?', NOW(), NOW()),
(@tpl_odonto, 'Historico Odontologico', 'Ja realizou tratamento de canal?', 'boolean', NULL, 0, 7, NULL, NOW(), NOW()),
(@tpl_odonto, 'Historico Odontologico', 'Ja usou aparelho ortodontico?', 'boolean', NULL, 0, 8, NULL, NOW(), NOW()),
(@tpl_odonto, 'Historico Odontologico', 'Ja realizou extracao de dente?', 'boolean', NULL, 0, 9, NULL, NOW(), NOW()),
(@tpl_odonto, 'Historico Odontologico', 'Ja fez clareamento dental?', 'boolean', NULL, 0, 10, NULL, NOW(), NOW()),
(@tpl_odonto, 'Historico Odontologico', 'Usa protese dentaria?', 'boolean', NULL, 0, 11, NULL, NOW(), NOW()),
(@tpl_odonto, 'Historico Odontologico', 'Range ou aperta os dentes (bruxismo)?', 'boolean', NULL, 0, 12, NULL, NOW(), NOW()),
(@tpl_odonto, 'Saude Geral', 'Possui alguma doenca sistêmica?', 'checkbox', '["Diabetes","Hipertensao","Cardiopatia","Hepatite","HIV","Asma","Anemia","Nenhuma"]', 0, 13, NULL, NOW(), NOW()),
(@tpl_odonto, 'Saude Geral', 'Medicamentos em uso', 'textarea', NULL, 0, 14, 'Liste todos os medicamentos...', NOW(), NOW()),
(@tpl_odonto, 'Saude Geral', 'Alergia a medicamentos?', 'text', NULL, 0, 15, 'Especifique quais...', NOW(), NOW()),
(@tpl_odonto, 'Saude Geral', 'Alergia a latex?', 'boolean', NULL, 0, 16, NULL, NOW(), NOW()),
(@tpl_odonto, 'Saude Geral', 'Ja teve reacao a anestesia?', 'boolean', NULL, 0, 17, NULL, NOW(), NOW()),
(@tpl_odonto, 'Saude Geral', 'Sangra muito ao se cortar?', 'boolean', NULL, 0, 18, NULL, NOW(), NOW()),
(@tpl_odonto, 'Saude Geral', 'Esta gravida ou amamentando?', 'select', '["Nao se aplica","Gravida","Amamentando"]', 0, 19, NULL, NOW(), NOW()),
(@tpl_odonto, 'Saude Geral', 'Tabagismo', 'boolean', NULL, 0, 20, NULL, NOW(), NOW()),
(@tpl_odonto, 'Habitos', 'Frequencia de escovacao diaria', 'select', '["1 vez","2 vezes","3 vezes","Mais de 3 vezes"]', 0, 21, NULL, NOW(), NOW()),
(@tpl_odonto, 'Habitos', 'Usa fio dental?', 'boolean', NULL, 0, 22, NULL, NOW(), NOW()),
(@tpl_odonto, 'Habitos', 'Usa enxaguante bucal?', 'boolean', NULL, 0, 23, NULL, NOW(), NOW());

-- =============================================
-- 3. PSICOLOGIA (Psychology)
-- =============================================
INSERT INTO anamnesis_templates (company_id, specialty, name, description, is_active, created_at, updated_at)
VALUES (NULL, 'psicologia', 'Anamnese Psicologica - Geral', 'Ficha de anamnese padrao para avaliacao psicologica inicial.', 1, NOW(), NOW());

SET @tpl_psico = LAST_INSERT_ID();

INSERT INTO anamnesis_template_fields (template_id, section, label, field_type, options, is_required, sort_order, placeholder, created_at, updated_at) VALUES
(@tpl_psico, 'Motivo da Consulta', 'Qual o principal motivo que o(a) trouxe a terapia?', 'textarea', NULL, 1, 1, 'Descreva o que motivou a busca por atendimento...', NOW(), NOW()),
(@tpl_psico, 'Motivo da Consulta', 'Ha quanto tempo percebe essa demanda?', 'text', NULL, 0, 2, 'Ex: semanas, meses, anos...', NOW(), NOW()),
(@tpl_psico, 'Motivo da Consulta', 'Ja realizou acompanhamento psicologico antes?', 'boolean', NULL, 0, 3, NULL, NOW(), NOW()),
(@tpl_psico, 'Motivo da Consulta', 'Se sim, por quanto tempo e motivo?', 'textarea', NULL, 0, 4, 'Descreva a experiência anterior...', NOW(), NOW()),
(@tpl_psico, 'Motivo da Consulta', 'Ja realizou acompanhamento psiquiatrico?', 'boolean', NULL, 0, 5, NULL, NOW(), NOW()),
(@tpl_psico, 'Saude Mental', 'Sintomas que sente atualmente', 'checkbox', '["Ansiedade","Tristeza","Irritabilidade","Insonia","Falta de apetite","Excesso de apetite","Dificuldade de concentracao","Pensamentos negativos recorrentes","Falta de motivacao","Choro frequente","Isolamento social","Medo excessivo","Ataques de panico"]', 0, 6, NULL, NOW(), NOW()),
(@tpl_psico, 'Saude Mental', 'Utiliza medicacao psiquiatrica?', 'boolean', NULL, 0, 7, NULL, NOW(), NOW()),
(@tpl_psico, 'Saude Mental', 'Se sim, quais medicacoes?', 'textarea', NULL, 0, 8, 'Nome e dosagem dos medicamentos...', NOW(), NOW()),
(@tpl_psico, 'Saude Mental', 'Ja teve ideacao suicida?', 'boolean', NULL, 0, 9, NULL, NOW(), NOW()),
(@tpl_psico, 'Saude Mental', 'Faz uso de substancias (alcool, drogas)?', 'select', '["Nao","Socialmente","Frequentemente","Em tratamento"]', 0, 10, NULL, NOW(), NOW()),
(@tpl_psico, 'Historico Familiar', 'Historico de doencas mentais na familia', 'checkbox', '["Depressao","Ansiedade","Bipolaridade","Esquizofrenia","Dependencia quimica","Suicidio","Nenhum"]', 0, 11, NULL, NOW(), NOW()),
(@tpl_psico, 'Historico Familiar', 'Estado civil', 'select', '["Solteiro(a)","Casado(a)","Uniao estavel","Divorciado(a)","Viuvo(a)"]', 0, 12, NULL, NOW(), NOW()),
(@tpl_psico, 'Historico Familiar', 'Possui filhos?', 'boolean', NULL, 0, 13, NULL, NOW(), NOW()),
(@tpl_psico, 'Historico Familiar', 'Como e a relacao com a familia?', 'select', '["Boa","Regular","Conflituosa","Distante","Sem contato"]', 0, 14, NULL, NOW(), NOW()),
(@tpl_psico, 'Rotina e Vida Social', 'Como descreve sua rotina diaria?', 'textarea', NULL, 0, 15, 'Descreva sua rotina de trabalho, lazer e descanso...', NOW(), NOW()),
(@tpl_psico, 'Rotina e Vida Social', 'Pratica atividade fisica?', 'boolean', NULL, 0, 16, NULL, NOW(), NOW()),
(@tpl_psico, 'Rotina e Vida Social', 'Qualidade do sono', 'select', '["Boa","Regular","Ruim","Insonia frequente"]', 0, 17, NULL, NOW(), NOW()),
(@tpl_psico, 'Rotina e Vida Social', 'Possui rede de apoio (amigos, familia)?', 'boolean', NULL, 0, 18, NULL, NOW(), NOW()),
(@tpl_psico, 'Expectativas', 'O que espera da terapia?', 'textarea', NULL, 0, 19, 'Quais seus objetivos com o tratamento...', NOW(), NOW());

-- =============================================
-- 4. NUTRICAO (Nutrition)
-- =============================================
INSERT INTO anamnesis_templates (company_id, specialty, name, description, is_active, created_at, updated_at)
VALUES (NULL, 'nutricao', 'Anamnese Nutricional - Geral', 'Ficha de anamnese padrao para avaliacao nutricional.', 1, NOW(), NOW());

SET @tpl_nutri = LAST_INSERT_ID();

INSERT INTO anamnesis_template_fields (template_id, section, label, field_type, options, is_required, sort_order, placeholder, created_at, updated_at) VALUES
(@tpl_nutri, 'Motivo da Consulta', 'Qual o objetivo da consulta nutricional?', 'checkbox', '["Emagrecimento","Ganho de massa muscular","Reeducacao alimentar","Controle de doenca","Saude geral","Desempenho esportivo","Gestacao/Amamentacao"]', 1, 1, NULL, NOW(), NOW()),
(@tpl_nutri, 'Motivo da Consulta', 'Ja fez acompanhamento nutricional antes?', 'boolean', NULL, 0, 2, NULL, NOW(), NOW()),
(@tpl_nutri, 'Motivo da Consulta', 'Ja fez dieta por conta propria?', 'boolean', NULL, 0, 3, NULL, NOW(), NOW()),
(@tpl_nutri, 'Historico de Saude', 'Doencas diagnosticadas', 'checkbox', '["Diabetes","Hipertensao","Colesterol alto","Triglicerides alto","Anemia","Hipotireoidismo","Hipertireoidismo","Gastrite/Refluxo","Intolerancia a lactose","Doenca celiaca","Sindrome do intestino irritavel","Nenhuma"]', 0, 4, NULL, NOW(), NOW()),
(@tpl_nutri, 'Historico de Saude', 'Medicamentos em uso', 'textarea', NULL, 0, 5, 'Liste os medicamentos...', NOW(), NOW()),
(@tpl_nutri, 'Historico de Saude', 'Suplementos em uso', 'textarea', NULL, 0, 6, 'Vitaminas, proteinas, etc...', NOW(), NOW()),
(@tpl_nutri, 'Historico de Saude', 'Alergias ou intolerancias alimentares', 'text', NULL, 0, 7, 'Quais alimentos?', NOW(), NOW()),
(@tpl_nutri, 'Historico de Saude', 'Funcionamento intestinal', 'select', '["Regular (diario)","A cada 2 dias","Irregular","Constipacao frequente","Diarreia frequente"]', 0, 8, NULL, NOW(), NOW()),
(@tpl_nutri, 'Historico de Saude', 'Historico familiar de doencas', 'checkbox', '["Diabetes","Obesidade","Doencas cardiacas","Cancer","Hipertensao","Nenhum"]', 0, 9, NULL, NOW(), NOW()),
(@tpl_nutri, 'Habitos Alimentares', 'Quantas refeicoes faz por dia?', 'select', '["1 a 2","3","4","5","6 ou mais"]', 0, 10, NULL, NOW(), NOW()),
(@tpl_nutri, 'Habitos Alimentares', 'Costuma pular refeicoes?', 'boolean', NULL, 0, 11, NULL, NOW(), NOW()),
(@tpl_nutri, 'Habitos Alimentares', 'Consumo de agua diario (litros)', 'select', '["Menos de 1L","1 a 2L","2 a 3L","Mais de 3L"]', 0, 12, NULL, NOW(), NOW()),
(@tpl_nutri, 'Habitos Alimentares', 'Consome bebida alcoolica?', 'select', '["Nao","Raramente","Semanalmente","Diariamente"]', 0, 13, NULL, NOW(), NOW()),
(@tpl_nutri, 'Habitos Alimentares', 'Consome refrigerante/sucos industrializados?', 'select', '["Nao","Raramente","Semanalmente","Diariamente"]', 0, 14, NULL, NOW(), NOW()),
(@tpl_nutri, 'Habitos Alimentares', 'Alimentos que nao gosta', 'textarea', NULL, 0, 15, 'Liste os alimentos que nao consome...', NOW(), NOW()),
(@tpl_nutri, 'Habitos Alimentares', 'Alimentos favoritos', 'textarea', NULL, 0, 16, 'Liste seus alimentos preferidos...', NOW(), NOW()),
(@tpl_nutri, 'Habitos Alimentares', 'Descreva um dia alimentar tipico', 'textarea', NULL, 0, 17, 'Cafe da manha, almoco, lanche, jantar...', NOW(), NOW()),
(@tpl_nutri, 'Estilo de Vida', 'Pratica atividade fisica?', 'boolean', NULL, 0, 18, NULL, NOW(), NOW()),
(@tpl_nutri, 'Estilo de Vida', 'Se sim, qual atividade e frequencia?', 'text', NULL, 0, 19, 'Ex: Musculacao 4x/semana...', NOW(), NOW()),
(@tpl_nutri, 'Estilo de Vida', 'Qualidade do sono', 'select', '["Boa","Regular","Ruim"]', 0, 20, NULL, NOW(), NOW()),
(@tpl_nutri, 'Estilo de Vida', 'Nivel de estresse', 'select', '["Baixo","Moderado","Alto","Muito alto"]', 0, 21, NULL, NOW(), NOW()),
(@tpl_nutri, 'Medidas Antropometricas', 'Peso atual (kg)', 'number', NULL, 0, 22, 'Ex: 70', NOW(), NOW()),
(@tpl_nutri, 'Medidas Antropometricas', 'Altura (cm)', 'number', NULL, 0, 23, 'Ex: 170', NOW(), NOW()),
(@tpl_nutri, 'Medidas Antropometricas', 'Circunferencia abdominal (cm)', 'number', NULL, 0, 24, NULL, NOW(), NOW());

-- =============================================
-- 5. FONOAUDIOLOGIA (Speech Therapy)
-- =============================================
INSERT INTO anamnesis_templates (company_id, specialty, name, description, is_active, created_at, updated_at)
VALUES (NULL, 'fonoaudiologia', 'Anamnese Fonoaudiologica - Geral', 'Ficha de anamnese padrao para avaliacao fonoaudiologica.', 1, NOW(), NOW());

SET @tpl_fono = LAST_INSERT_ID();

INSERT INTO anamnesis_template_fields (template_id, section, label, field_type, options, is_required, sort_order, placeholder, created_at, updated_at) VALUES
(@tpl_fono, 'Queixa Principal', 'Qual o motivo da consulta?', 'textarea', NULL, 1, 1, 'Descreva a queixa principal...', NOW(), NOW()),
(@tpl_fono, 'Queixa Principal', 'Ha quanto tempo percebe a dificuldade?', 'text', NULL, 0, 2, 'Ex: desde a infancia, ha 6 meses...', NOW(), NOW()),
(@tpl_fono, 'Queixa Principal', 'Area de preocupacao', 'checkbox', '["Fala","Linguagem","Voz","Audicao","Motricidade orofacial","Degluticao","Leitura/Escrita"]', 1, 3, NULL, NOW(), NOW()),
(@tpl_fono, 'Queixa Principal', 'Ja realizou terapia fonoaudiologica antes?', 'boolean', NULL, 0, 4, NULL, NOW(), NOW()),
(@tpl_fono, 'Historico do Desenvolvimento', 'Idade que comecou a falar', 'text', NULL, 0, 5, 'Ex: 1 ano, 2 anos...', NOW(), NOW()),
(@tpl_fono, 'Historico do Desenvolvimento', 'Houve atraso no desenvolvimento da fala?', 'boolean', NULL, 0, 6, NULL, NOW(), NOW()),
(@tpl_fono, 'Historico do Desenvolvimento', 'Trocas na fala (ex: "tasa" por "casa")', 'boolean', NULL, 0, 7, NULL, NOW(), NOW()),
(@tpl_fono, 'Historico do Desenvolvimento', 'Dificuldade de compreensao?', 'boolean', NULL, 0, 8, NULL, NOW(), NOW()),
(@tpl_fono, 'Historico do Desenvolvimento', 'Gagueira ou hesitacoes na fala?', 'boolean', NULL, 0, 9, NULL, NOW(), NOW()),
(@tpl_fono, 'Audicao', 'Ja realizou exame audiologico?', 'boolean', NULL, 0, 10, NULL, NOW(), NOW()),
(@tpl_fono, 'Audicao', 'Apresenta perda auditiva diagnosticada?', 'boolean', NULL, 0, 11, NULL, NOW(), NOW()),
(@tpl_fono, 'Audicao', 'Usa aparelho auditivo?', 'boolean', NULL, 0, 12, NULL, NOW(), NOW()),
(@tpl_fono, 'Audicao', 'Sente zumbido no ouvido?', 'boolean', NULL, 0, 13, NULL, NOW(), NOW()),
(@tpl_fono, 'Audicao', 'Otites frequentes?', 'boolean', NULL, 0, 14, NULL, NOW(), NOW()),
(@tpl_fono, 'Voz', 'Apresenta rouquidao frequente?', 'boolean', NULL, 0, 15, NULL, NOW(), NOW()),
(@tpl_fono, 'Voz', 'Cansaco vocal?', 'boolean', NULL, 0, 16, NULL, NOW(), NOW()),
(@tpl_fono, 'Voz', 'Usa a voz profissionalmente?', 'boolean', NULL, 0, 17, NULL, NOW(), NOW()),
(@tpl_fono, 'Saude Geral', 'Doencas diagnosticadas', 'textarea', NULL, 0, 18, 'Problemas neurologicos, respiratorios...', NOW(), NOW()),
(@tpl_fono, 'Saude Geral', 'Medicamentos em uso', 'textarea', NULL, 0, 19, 'Liste os medicamentos...', NOW(), NOW()),
(@tpl_fono, 'Saude Geral', 'Respira pela boca?', 'boolean', NULL, 0, 20, NULL, NOW(), NOW()),
(@tpl_fono, 'Saude Geral', 'Ronca durante o sono?', 'boolean', NULL, 0, 21, NULL, NOW(), NOW()),
(@tpl_fono, 'Alimentacao', 'Dificuldade para mastigar?', 'boolean', NULL, 0, 22, NULL, NOW(), NOW()),
(@tpl_fono, 'Alimentacao', 'Dificuldade para engolir?', 'boolean', NULL, 0, 23, NULL, NOW(), NOW()),
(@tpl_fono, 'Alimentacao', 'Engasga com frequencia?', 'boolean', NULL, 0, 24, NULL, NOW(), NOW());

-- =============================================
-- 6. MEDICINA (Medicine)
-- =============================================
INSERT INTO anamnesis_templates (company_id, specialty, name, description, is_active, created_at, updated_at)
VALUES (NULL, 'medicina', 'Anamnese Medica - Geral', 'Ficha de anamnese padrao para consulta medica geral.', 1, NOW(), NOW());

SET @tpl_med = LAST_INSERT_ID();

INSERT INTO anamnesis_template_fields (template_id, section, label, field_type, options, is_required, sort_order, placeholder, created_at, updated_at) VALUES
(@tpl_med, 'Queixa Principal', 'Qual o motivo da consulta?', 'textarea', NULL, 1, 1, 'Descreva seus sintomas e motivo da visita...', NOW(), NOW()),
(@tpl_med, 'Queixa Principal', 'Ha quanto tempo apresenta os sintomas?', 'text', NULL, 1, 2, 'Ex: 2 dias, 1 semana, 3 meses...', NOW(), NOW()),
(@tpl_med, 'Queixa Principal', 'Os sintomas estao piorando?', 'select', '["Melhorando","Estavel","Piorando"]', 0, 3, NULL, NOW(), NOW()),
(@tpl_med, 'Historico Patologico Pessoal', 'Doencas cronicas diagnosticadas', 'checkbox', '["Hipertensao","Diabetes tipo 1","Diabetes tipo 2","Asma","DPOC","Doenca cardiaca","AVC","Cancer","Doenca renal","Doenca hepatica","Epilepsia","Depressao","Ansiedade","Nenhuma"]', 0, 4, NULL, NOW(), NOW()),
(@tpl_med, 'Historico Patologico Pessoal', 'Cirurgias anteriores', 'textarea', NULL, 0, 5, 'Liste as cirurgias realizadas e datas aproximadas...', NOW(), NOW()),
(@tpl_med, 'Historico Patologico Pessoal', 'Internacoes anteriores', 'textarea', NULL, 0, 6, 'Motivos e datas aproximadas...', NOW(), NOW()),
(@tpl_med, 'Historico Patologico Pessoal', 'Alergias conhecidas', 'textarea', NULL, 0, 7, 'Medicamentos, alimentos, substancias...', NOW(), NOW()),
(@tpl_med, 'Medicacoes', 'Medicamentos em uso contínuo', 'textarea', NULL, 0, 8, 'Nome, dosagem e frequencia...', NOW(), NOW()),
(@tpl_med, 'Medicacoes', 'Vacinas em dia?', 'boolean', NULL, 0, 9, NULL, NOW(), NOW()),
(@tpl_med, 'Historico Familiar', 'Doencas na familia', 'checkbox', '["Hipertensao","Diabetes","Cancer","Doenca cardiaca","AVC","Doenca mental","Doenca autoimune","Nenhuma"]', 0, 10, NULL, NOW(), NOW()),
(@tpl_med, 'Historico Familiar', 'Detalhes do historico familiar', 'textarea', NULL, 0, 11, 'Pai, mae, irmaos - quais doencas...', NOW(), NOW()),
(@tpl_med, 'Revisao de Sistemas', 'Sintomas apresentados', 'checkbox', '["Febre","Perda de peso","Ganho de peso","Fadiga","Dor de cabeca","Tontura","Falta de ar","Dor no peito","Palpitacoes","Nauseas","Vomitos","Diarreia","Constipacao","Dor abdominal","Dor articular","Alteracoes na pele","Alteracoes urinarias"]', 0, 12, NULL, NOW(), NOW()),
(@tpl_med, 'Habitos de Vida', 'Tabagismo', 'select', '["Nunca fumou","Ex-fumante","Fumante atual"]', 0, 13, NULL, NOW(), NOW()),
(@tpl_med, 'Habitos de Vida', 'Consumo de alcool', 'select', '["Nao consome","Social/ocasional","Moderado","Frequente"]', 0, 14, NULL, NOW(), NOW()),
(@tpl_med, 'Habitos de Vida', 'Atividade fisica', 'select', '["Sedentario","Leve (1-2x/semana)","Moderada (3-4x/semana)","Intensa (5+x/semana)"]', 0, 15, NULL, NOW(), NOW()),
(@tpl_med, 'Habitos de Vida', 'Qualidade do sono', 'select', '["Boa","Regular","Ruim","Insonia"]', 0, 16, NULL, NOW(), NOW()),
(@tpl_med, 'Habitos de Vida', 'Alimentacao', 'select', '["Equilibrada","Regular","Irregular","Restritiva"]', 0, 17, NULL, NOW(), NOW()),
(@tpl_med, 'Saude da Mulher', 'Data da ultima menstruacao', 'date', NULL, 0, 18, NULL, NOW(), NOW()),
(@tpl_med, 'Saude da Mulher', 'Gestacoes anteriores', 'number', NULL, 0, 19, 'Numero de gestacoes', NOW(), NOW()),
(@tpl_med, 'Saude da Mulher', 'Uso de metodo contraceptivo', 'text', NULL, 0, 20, 'Qual metodo?', NOW(), NOW());

-- =============================================
-- 7. ESTETICA (Aesthetics)
-- =============================================
INSERT INTO anamnesis_templates (company_id, specialty, name, description, is_active, created_at, updated_at)
VALUES (NULL, 'estetica', 'Anamnese Estetica - Geral', 'Ficha de anamnese padrao para procedimentos esteticos.', 1, NOW(), NOW());

SET @tpl_estet = LAST_INSERT_ID();

INSERT INTO anamnesis_template_fields (template_id, section, label, field_type, options, is_required, sort_order, placeholder, created_at, updated_at) VALUES
(@tpl_estet, 'Objetivo do Tratamento', 'Qual o objetivo do tratamento estetico?', 'textarea', NULL, 1, 1, 'Descreva o que deseja tratar ou melhorar...', NOW(), NOW()),
(@tpl_estet, 'Objetivo do Tratamento', 'Area(s) de interesse', 'checkbox', '["Rosto","Pescoco","Colo","Abdomen","Bracos","Pernas","Gluteos","Costas","Corpo inteiro"]', 1, 2, NULL, NOW(), NOW()),
(@tpl_estet, 'Objetivo do Tratamento', 'Ja realizou procedimentos esteticos antes?', 'boolean', NULL, 0, 3, NULL, NOW(), NOW()),
(@tpl_estet, 'Objetivo do Tratamento', 'Se sim, quais procedimentos?', 'textarea', NULL, 0, 4, 'Liste os procedimentos anteriores...', NOW(), NOW()),
(@tpl_estet, 'Pele', 'Tipo de pele', 'select', '["Normal","Seca","Oleosa","Mista","Sensível"]', 0, 5, NULL, NOW(), NOW()),
(@tpl_estet, 'Pele', 'Fototipo (classificacao de Fitzpatrick)', 'select', '["I - Muito clara","II - Clara","III - Morena clara","IV - Morena","V - Morena escura","VI - Negra"]', 0, 6, NULL, NOW(), NOW()),
(@tpl_estet, 'Pele', 'Queixas em relacao a pele', 'checkbox', '["Acne","Manchas","Rugas","Flacidez","Celulite","Estrias","Olheiras","Gordura localizada","Cicatrizes","Poros dilatados","Nenhuma"]', 0, 7, NULL, NOW(), NOW()),
(@tpl_estet, 'Pele', 'Utiliza protetor solar diariamente?', 'boolean', NULL, 0, 8, NULL, NOW(), NOW()),
(@tpl_estet, 'Pele', 'Produtos de skincare que utiliza', 'textarea', NULL, 0, 9, 'Liste os produtos...', NOW(), NOW()),
(@tpl_estet, 'Pele', 'Exposicao solar frequente?', 'boolean', NULL, 0, 10, NULL, NOW(), NOW()),
(@tpl_estet, 'Saude e Contraindicacoes', 'Possui alguma doenca de pele?', 'text', NULL, 0, 11, 'Dermatite, psoríase, vitiligo...', NOW(), NOW()),
(@tpl_estet, 'Saude e Contraindicacoes', 'Possui alguma doenca cronica?', 'checkbox', '["Diabetes","Hipertensao","Lupus","Doenca autoimune","Cancer","Epilepsia","Nenhuma"]', 0, 12, NULL, NOW(), NOW()),
(@tpl_estet, 'Saude e Contraindicacoes', 'Medicamentos em uso', 'textarea', NULL, 0, 13, 'Incluindo acido retinoico, anticoagulantes...', NOW(), NOW()),
(@tpl_estet, 'Saude e Contraindicacoes', 'Alergias conhecidas', 'text', NULL, 0, 14, 'Cosmeticos, substancias, medicamentos...', NOW(), NOW()),
(@tpl_estet, 'Saude e Contraindicacoes', 'Esta gravida ou amamentando?', 'boolean', NULL, 0, 15, NULL, NOW(), NOW()),
(@tpl_estet, 'Saude e Contraindicacoes', 'Tem tendencia a queloides?', 'boolean', NULL, 0, 16, NULL, NOW(), NOW()),
(@tpl_estet, 'Saude e Contraindicacoes', 'Usa marcapasso ou protese metalica?', 'boolean', NULL, 0, 17, NULL, NOW(), NOW()),
(@tpl_estet, 'Saude e Contraindicacoes', 'Possui herpes labial recorrente?', 'boolean', NULL, 0, 18, NULL, NOW(), NOW()),
(@tpl_estet, 'Habitos', 'Tabagismo', 'boolean', NULL, 0, 19, NULL, NOW(), NOW()),
(@tpl_estet, 'Habitos', 'Consumo de agua diario', 'select', '["Menos de 1L","1 a 2L","Mais de 2L"]', 0, 20, NULL, NOW(), NOW()),
(@tpl_estet, 'Habitos', 'Pratica atividade fisica?', 'boolean', NULL, 0, 21, NULL, NOW(), NOW()),
(@tpl_estet, 'Habitos', 'Qualidade do sono', 'select', '["Boa","Regular","Ruim"]', 0, 22, NULL, NOW(), NOW());

-- =============================================
-- 8. OUTRO (Other / General)
-- =============================================
INSERT INTO anamnesis_templates (company_id, specialty, name, description, is_active, created_at, updated_at)
VALUES (NULL, 'outro', 'Anamnese Geral', 'Ficha de anamnese padrao geral, para qualquer area de saude.', 1, NOW(), NOW());

SET @tpl_geral = LAST_INSERT_ID();

INSERT INTO anamnesis_template_fields (template_id, section, label, field_type, options, is_required, sort_order, placeholder, created_at, updated_at) VALUES
(@tpl_geral, 'Queixa Principal', 'Qual o motivo da consulta?', 'textarea', NULL, 1, 1, 'Descreva o motivo da sua visita...', NOW(), NOW()),
(@tpl_geral, 'Queixa Principal', 'Ha quanto tempo apresenta essa queixa?', 'text', NULL, 0, 2, 'Ex: dias, semanas, meses...', NOW(), NOW()),
(@tpl_geral, 'Queixa Principal', 'Ja procurou outro profissional para essa queixa?', 'boolean', NULL, 0, 3, NULL, NOW(), NOW()),
(@tpl_geral, 'Historico de Saude', 'Doencas diagnosticadas', 'checkbox', '["Hipertensao","Diabetes","Asma","Doenca cardiaca","Depressao","Ansiedade","Cancer","Doenca renal","Doenca hepatica","Nenhuma"]', 0, 4, NULL, NOW(), NOW()),
(@tpl_geral, 'Historico de Saude', 'Outras doencas nao listadas acima', 'text', NULL, 0, 5, 'Especifique...', NOW(), NOW()),
(@tpl_geral, 'Historico de Saude', 'Ja realizou cirurgias?', 'boolean', NULL, 0, 6, NULL, NOW(), NOW()),
(@tpl_geral, 'Historico de Saude', 'Se sim, quais cirurgias?', 'textarea', NULL, 0, 7, 'Descreva as cirurgias e datas...', NOW(), NOW()),
(@tpl_geral, 'Historico de Saude', 'Internacoes anteriores', 'boolean', NULL, 0, 8, NULL, NOW(), NOW()),
(@tpl_geral, 'Medicacoes e Alergias', 'Medicamentos em uso', 'textarea', NULL, 0, 9, 'Nome, dosagem e frequencia dos medicamentos...', NOW(), NOW()),
(@tpl_geral, 'Medicacoes e Alergias', 'Alergias a medicamentos', 'text', NULL, 0, 10, 'Quais medicamentos causa alergia?', NOW(), NOW()),
(@tpl_geral, 'Medicacoes e Alergias', 'Outras alergias', 'text', NULL, 0, 11, 'Alimentos, substancias, materiais...', NOW(), NOW()),
(@tpl_geral, 'Historico Familiar', 'Doencas na familia (pais, irmaos)', 'checkbox', '["Hipertensao","Diabetes","Cancer","Doenca cardiaca","AVC","Doenca mental","Nenhuma"]', 0, 12, NULL, NOW(), NOW()),
(@tpl_geral, 'Habitos de Vida', 'Pratica atividade fisica?', 'boolean', NULL, 0, 13, NULL, NOW(), NOW()),
(@tpl_geral, 'Habitos de Vida', 'Se sim, qual e frequencia?', 'text', NULL, 0, 14, 'Ex: Caminhada 3x/semana...', NOW(), NOW()),
(@tpl_geral, 'Habitos de Vida', 'Tabagismo', 'select', '["Nunca fumou","Ex-fumante","Fumante"]', 0, 15, NULL, NOW(), NOW()),
(@tpl_geral, 'Habitos de Vida', 'Consumo de alcool', 'select', '["Nao","Social","Frequente"]', 0, 16, NULL, NOW(), NOW()),
(@tpl_geral, 'Habitos de Vida', 'Qualidade do sono', 'select', '["Boa","Regular","Ruim"]', 0, 17, NULL, NOW(), NOW()),
(@tpl_geral, 'Habitos de Vida', 'Consumo de agua diario', 'select', '["Menos de 1L","1 a 2L","2 a 3L","Mais de 3L"]', 0, 18, NULL, NOW(), NOW()),
(@tpl_geral, 'Habitos de Vida', 'Alimentacao', 'select', '["Equilibrada","Regular","Irregular"]', 0, 19, NULL, NOW(), NOW()),
(@tpl_geral, 'Informacoes Complementares', 'Esta gravida ou amamentando?', 'select', '["Nao se aplica","Gravida","Amamentando","Nao"]', 0, 20, NULL, NOW(), NOW()),
(@tpl_geral, 'Informacoes Complementares', 'Expectativa com o tratamento', 'textarea', NULL, 0, 21, 'O que espera alcançar?', NOW(), NOW());
