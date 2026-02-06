# Guia de Segurança

## Rotação de Credenciais

### Frequência Recomendada

| Credencial | Frequência | Prioridade |
|---|---|---|
| SESSION_SECRET | A cada 90 dias | Alta |
| MYSQL_PASSWORD | A cada 90 dias | Alta |
| OPENAI_API_KEY | A cada 180 dias ou se comprometida | Media |
| ASAAS_API_KEY | A cada 180 dias ou se comprometida | Media |
| EVOLUTION_API_KEY | A cada 180 dias | Media |

### Procedimento de Rotação

1. **Gerar nova credencial** (nunca reutilize valores anteriores)
2. **Atualizar no ambiente de staging** primeiro
3. **Testar funcionalidade** afetada
4. **Atualizar em produção** durante janela de manutenção
5. **Revogar credencial anterior** (quando possível)
6. **Registrar a rotação** com data e responsável

### Gerar Secrets Seguros

```bash
# SESSION_SECRET (64 bytes hex)
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Senha de banco de dados (32 caracteres)
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

---

## Auditoria Trimestral de Segurança

### Checklist

#### 1. Dependencias
- [ ] Executar `npm audit` e resolver vulnerabilidades HIGH/CRITICAL
- [ ] Atualizar dependencias com patches de seguranca
- [ ] Verificar se ha dependencias abandonadas/deprecated

#### 2. Credenciais
- [ ] Rotacionar todas as credenciais conforme tabela acima
- [ ] Verificar se nenhum secret esta no codigo-fonte (git log)
- [ ] Revisar acessos de banco de dados (remover usuarios inativos)

#### 3. Endpoints e API
- [ ] Revisar endpoints publicos (sem autenticacao)
- [ ] Verificar rate limiting esta funcionando
- [ ] Testar protecao CSRF
- [ ] Verificar headers de seguranca com securityheaders.com

#### 4. Dados
- [ ] Verificar se logs nao contem dados sensiveis
- [ ] Revisar backups de banco de dados
- [ ] Verificar politica de retencao de dados

#### 5. Infra
- [ ] Verificar certificado SSL (validade e configuracao)
- [ ] Revisar regras de firewall
- [ ] Verificar atualizacoes do sistema operacional do servidor
- [ ] Testar plano de recuperacao de desastres

#### 6. Codigo
- [ ] Executar scan de seguranca (CI/CD pipeline)
- [ ] Revisar novos endpoints adicionados desde ultima auditoria
- [ ] Verificar se validacao Zod esta presente em todos os endpoints POST/PUT

### Registro de Auditorias

| Data | Responsavel | Issues Encontradas | Status |
|---|---|---|---|
| _Preencher_ | _Nome_ | _Descricao_ | _Resolvido/Pendente_ |

---

## Resposta a Incidentes

### Se uma credencial for comprometida:

1. **Rotacionar imediatamente** a credencial afetada
2. **Verificar logs** para atividade suspeita no periodo
3. **Notificar** a equipe e stakeholders relevantes
4. **Documentar** o incidente com timeline e acoes tomadas
5. **Revisar** como o comprometimento ocorreu e prevenir recorrencia

### Contatos de Emergencia

- Administrador do sistema: _(preencher)_
- Suporte do provedor de hosting: _(preencher)_
