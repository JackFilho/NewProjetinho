# 📋 Instruções para Migração - Sistema de Horários Individuais

## ✅ O que foi implementado

Foi criado um novo sistema onde **cada profissional pode ter horários diferentes para cada dia da semana**.

**Exemplo:**
- Segunda: 09:00 - 18:00
- Quarta: 09:00 - 22:00
- Sexta: 14:00 - 20:00

## 🔧 O que você precisa fazer

### Passo 1: Executar a Migração SQL

1. Abra seu **phpMyAdmin** ou cliente MySQL
2. Selecione o banco de dados `inhousec_sistema`
3. Vá na aba **SQL**
4. Abra o arquivo `MIGRATE_SCHEDULES.sql` (na raiz do projeto)
5. Copie TODO o conteúdo
6. Cole na área de SQL
7. Clique em **Executar** ou **Go**

**O que este script faz:**
- ✅ Cria a tabela `professional_schedules`
- ✅ Migra os dados do João Silva (ID 3) criando horários para Segunda a Sábado (09:00-18:00)
- ✅ Mostra um relatório dos horários criados

### Passo 2: Fazer Deploy do Código Atualizado

O código já foi compilado (`npm run build` executado com sucesso).

**Você precisa:**
1. Fazer upload dos arquivos atualizados para seu servidor:
   - `dist/` (pasta completa)
   - `migrations/022_create_professional_schedules.sql`
   - `shared/schema.ts`
   - `server/storage.ts`
   - `server/routes.ts`
   - `client/src/pages/company-professionals.tsx`

2. Reiniciar o servidor Node.js

### Passo 3: Testar o Sistema

1. **Faça login no sistema**
2. **Vá em Profissionais**
3. **Clique em Editar** no profissional João Silva
4. **Vá na aba "Horários"**
5. **Você verá os 7 dias da semana:**
   - Domingo
   - Segunda-feira
   - Terça-feira
   - Quarta-feira
   - Quinta-feira
   - Sexta-feira
   - Sábado

6. **Para cada dia você pode:**
   - ✅ Marcar/desmarcar se o profissional trabalha naquele dia
   - ⏰ Definir horário de início (ex: 09:00)
   - ⏰ Definir horário de término (ex: 22:00)
   - 💾 Salvar cada dia individualmente

## 🎯 Se você tiver MAIS profissionais

### Opção 1: Via SQL (Manual)

No arquivo `MIGRATE_SCHEDULES.sql`, copie o bloco de INSERT e mude:
- O `professional_id` (troque 3 pelo ID do outro profissional)
- Os horários `start_time` e `end_time` se necessário

### Opção 2: Via Sistema (Automático)

Depois que o servidor estiver rodando com o código atualizado:

1. **Faça uma requisição POST** para:
   ```
   POST http://seu-dominio.com/api/company/professionals/migrate-schedules
   ```

2. Isso irá migrar TODOS os profissionais automaticamente

3. Ou use o Postman/Insomnia:
   - Método: POST
   - URL: `http://localhost:5000/api/company/professionals/migrate-schedules`
   - Headers: Cookie com sessão autenticada

## 📊 Como verificar se funcionou

Execute no SQL:

```sql
-- Ver todos os horários criados
SELECT
  p.name AS profissional,
  CASE ps.day_of_week
    WHEN 0 THEN 'Domingo'
    WHEN 1 THEN 'Segunda'
    WHEN 2 THEN 'Terça'
    WHEN 3 THEN 'Quarta'
    WHEN 4 THEN 'Quinta'
    WHEN 5 THEN 'Sexta'
    WHEN 6 THEN 'Sábado'
  END AS dia,
  ps.start_time AS inicio,
  ps.end_time AS fim,
  ps.is_enabled AS ativo
FROM professional_schedules ps
JOIN professionals p ON ps.professional_id = p.id
ORDER BY p.name, ps.day_of_week;
```

## ❓ Dúvidas ou Problemas

Se após executar o script:
- ✅ A tabela `professional_schedules` foi criada? → Verifique no phpMyAdmin
- ✅ Os horários foram inseridos? → Execute a query acima
- ✅ O sistema está mostrando a aba "Horários"? → Verifique se fez deploy
- ❌ Deu erro? → Me envie o erro completo

## 🔄 Reversão (se necessário)

Se quiser voltar ao sistema antigo:

```sql
DROP TABLE professional_schedules;
```

E fazer rollback do código para a versão anterior.

---

**Próximos passos após a migração:**
1. ✅ Teste editando os horários de cada dia
2. ✅ Envie mensagens via WhatsApp e veja se o agente respeita os horários individuais
3. ✅ Cadastre novos profissionais e configure seus horários
