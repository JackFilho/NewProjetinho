# Guia: Integração UAZAPI + Chatwoot por Cliente

## Informações fixas (suas, não mudam)

| Campo | Valor |
|---|---|
| URL UAZAPI | https://conexaoaida.uazapi.com |
| URL Chatwoot | https://chat.inhouses.org |
| Account ID Chatwoot | 1 |
| Access Token Chatwoot | (seu token do perfil do Chatwoot) |

---

## Passo a passo para cada novo cliente

### PASSO 1 — Criar instância na UAZAPI

1. Acesse https://conexaoaida.uazapi.com
2. Crie uma nova instância para o cliente
3. Conecte o WhatsApp (QR Code ou código de pareamento)
4. **Anote o token da instância** — você vai precisar dele

---

### PASSO 2 — Criar inbox no Chatwoot

1. Acesse https://chat.inhouses.org
2. Vá em **Settings → Inboxes → Add Inbox**
3. Escolha o tipo **API**
4. Em **Nome do Canal** coloque o nome do cliente (ex: `João Silva`)
5. Deixe o campo **URL do Webhook vazio** por enquanto
6. Clique em **Criar canal de API**
7. **Anote o Inbox ID** — ele aparece na URL da página:
   ```
   .../settings/inboxes/NUMERO/finish
                        ^^^^^^
                     esse é o ID
   ```

---

### PASSO 3 — Configurar integração via terminal da VPS

Acesse o terminal da VPS e rode o comando abaixo substituindo os valores:

```bash
curl -X PUT "https://conexaoaida.uazapi.com/chatwoot/config" -H "Content-Type: application/json" -H "token: TOKEN_DA_INSTANCIA_UAZAPI" -d '{"enabled": true, "url": "https://chat.inhouses.org", "access_token": "TOKEN_DO_CHATWOOT", "account_id": 1, "inbox_id": INBOX_ID, "ignore_groups": false, "sign_messages": true, "create_new_conversation": false}'
```

**O que substituir:**
- `TOKEN_DA_INSTANCIA_UAZAPI` → token anotado no Passo 1
- `TOKEN_DO_CHATWOOT` → seu access token do Chatwoot (Profile Settings > Access Token)
- `INBOX_ID` → número anotado no Passo 2

---

### PASSO 4 — Verificar se funcionou

```bash
curl -X GET "https://conexaoaida.uazapi.com/chatwoot/config" -H "token: TOKEN_DA_INSTANCIA_UAZAPI"
```

Na resposta, procure por:
```
"status":"ok"
"connection_ok":true
"credentials_ok":true
"webhook_configured":true
```

Se tudo estiver `true` e `ok` — **integração concluída!**

---

---

## Proxy por instância (isolamento de IP)

### Por que isso importa?

Com a Evolution hospedada em VPS própria, todas as instâncias compartilhavam o mesmo IP da VPS.
Se um cliente fosse banido por spam, o IP ficava "manchado" e podia impactar outros clientes.

Na UAZAPI, eles usam um **proxy interno próprio** com IPs brasileiros — mas a documentação
**não especifica** se cada instância recebe um IP dedicado ou se todas compartilham o mesmo pool.

> **Recomendação:** Confirme com o suporte da UAZAPI se o proxy interno já isola os IPs
> por instância. Se não isolar, aplique um proxy próprio por cliente (como descrito abaixo).

---

### Opções de proxy disponíveis

| Opção | Quando usar |
|---|---|
| Proxy interno (padrão) | Clientes brasileiros — já ativo, sem configurar nada |
| Proxy próprio via URL | Quando quiser garantir IP exclusivo por cliente |
| Celular Android como proxy | App da UAZAPI — alternativa ao proxy pago |

---

### OPCIONAL — Configurar proxy próprio por instância

Se quiser garantir isolamento de IP, atribua um proxy diferente para cada instância:

```bash
curl -X POST "https://conexaoaida.uazapi.com/instance/proxy" \
  -H "Content-Type: application/json" \
  -H "token: TOKEN_DA_INSTANCIA" \
  -d '{"enable": true, "proxy_url": "http://usuario:senha@ip:porta"}'
```

Formato da URL do proxy:
```
http://usuario:senha@ip:porta
```

---

### Verificar proxy atual de uma instância

```bash
curl -X GET "https://conexaoaida.uazapi.com/instance/proxy" \
  -H "token: TOKEN_DA_INSTANCIA"
```

Retorna:
```json
{
  "enabled": true,
  "proxy_url": "http://usuario:***@ip:porta",
  "last_test_at": 1234567890,
  "last_test_error": "",
  "validation_error": false
}
```

---

### Remover proxy (voltar ao padrão interno)

```bash
curl -X DELETE "https://conexaoaida.uazapi.com/instance/proxy" \
  -H "token: TOKEN_DA_INSTANCIA"
```

---

### Serviços de proxy recomendados (IPs residenciais/móveis)

Se for contratar proxies por cliente, prefira proxies **residenciais** ou **móveis** —
são mais difíceis de serem detectados pelo WhatsApp do que proxies de datacenter.

Exemplos de serviços: Bright Data, IPRoyal, Smartproxy, Proxy-Seller.

---

## Intervenção humana via Chatwoot (bloqueio de IA)

### O problema

Quando alguém envia mensagem diretamente pelo WhatsApp (celular/web), o sistema detecta
automaticamente como "intervenção humana" e pausa a IA. Porém, quando o agente responde
pelo Chatwoot, a mensagem chega via API e o sistema **não detectava** como intervenção humana.

### A solução

Foi adicionado um webhook no sistema que recebe eventos do Chatwoot. Quando um agente
envia mensagem pelo Chatwoot, o sistema automaticamente ativa o modo "human takeover"
(mesmo comportamento de quando alguém envia pelo celular).

### Como configurar (uma vez só)

1. No Chatwoot, vá em **Settings → Integrations → Webhooks**
2. Clique em **Configure** ou **Add new webhook**
3. Preencha:
   - **URL**: `https://SEU-DOMINIO/api/webhook/chatwoot`
     (substitua pelo domínio real da sua aplicação)
   - **Events**: marque `message_created` e `conversation_updated`
4. Salve

Pronto! A partir disso, toda mensagem enviada por um agente no Chatwoot vai
automaticamente pausar a IA para aquela conversa pelo tempo configurado no sistema
(campo `humanRequestTimeout` da empresa).

### Como funciona — Mensagem do agente

```
Agente envia mensagem no Chatwoot
       ↓
Chatwoot dispara webhook para /api/webhook/chatwoot
       ↓
Sistema detecta message_type = "outgoing" (agente)
       ↓
Busca a conversa pelo telefone do contato
       ↓
Ativa takeoverMode = "human" (mesma lógica do fromMe=true)
       ↓
IA fica pausada até o timeout expirar
```

### Observação importante

Este webhook é configurado **uma única vez** no nível da conta do Chatwoot.
Ele funciona para todas as inboxes/clientes automaticamente — não precisa
configurar por cliente.

---

## Bloqueio permanente de IA via etiqueta (label) do Chatwoot

### Como funciona

O Chatwoot tem um sistema de **etiquetas (labels)** que você pode adicionar às conversas.
Quando a etiqueta **"humano"** é adicionada a uma conversa, a IA é bloqueada
**permanentemente** para aquele contato — sem timeout. A IA só volta a responder
quando a etiqueta for removida.

### Diferença entre mensagem do agente e etiqueta

| Método | Comportamento |
|---|---|
| Agente envia mensagem | IA pausa por X minutos (timeout), depois volta |
| Etiqueta "humano" adicionada | IA bloqueada **permanentemente** até remover a etiqueta |

### Configuração

A configuração do webhook é a mesma descrita acima (já inclui o evento `conversation_updated`).
Basta criar a etiqueta "humano" no Chatwoot se ainda não existir:

1. No Chatwoot, vá em **Settings → Labels**
2. Clique em **Add Label**
3. Nome: `humano`
4. Salve

### Como usar

**Para bloquear a IA em uma conversa:**
1. Abra a conversa no Chatwoot
2. No painel lateral direito, em **Conversation Labels**, adicione a etiqueta `humano`
3. A IA para de responder imediatamente

**Para restaurar a IA:**
1. Remova a etiqueta `humano` da conversa
2. A IA volta a responder na próxima mensagem do cliente

### Como funciona internamente

```
Etiqueta "humano" adicionada no Chatwoot
       ↓
Chatwoot dispara evento conversation_updated
       ↓
Sistema verifica labels da conversa
       ↓
Encontra "humano" → ativa takeoverMode = "human" (permanente)
       ↓
IA bloqueada até a etiqueta ser removida
       ↓
Etiqueta removida → takeoverMode volta para "agent"
       ↓
IA responde normalmente
```

### Observações

- O nome da etiqueta precisa ser exatamente **humano** (minúsculo)
- A verificação é case-insensitive, então "Humano" ou "HUMANO" também funcionam
- Funciona para todas as inboxes/clientes automaticamente
- Pode ser combinada com outros labels sem interferência

---

## O que acontece depois de integrado

- Mensagens recebidas no WhatsApp do cliente → aparecem no Chatwoot na inbox dele
- Respostas enviadas pelo agente no Chatwoot → chegam no WhatsApp do cliente
- Apenas mensagens **novas** são sincronizadas (histórico anterior não aparece)

---

## Observações importantes

- A integração UAZAPI + Chatwoot está em fase **BETA**
- Cada cliente tem sua própria instância UAZAPI e sua própria inbox no Chatwoot
- Os únicos valores que mudam de cliente para cliente são:
  - Token da instância UAZAPI
  - Inbox ID no Chatwoot
- Se precisar **desativar** a integração de um cliente, rode o mesmo comando com `"enabled": false`
