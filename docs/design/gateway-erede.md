# Gateway eRede — Contrato e Integração

## Configuração

| Variável de ambiente | Descrição |
|---|---|
| `EREDE_CLIENT_ID` | OAuth 2.0 client (também header Affiliation) |
| `EREDE_CLIENT_SECRET` | OAuth 2.0 client secret |
| `EREDE_OAUTH_URL` | URL do endpoint /oauth2/token |
| `EREDE_TOKEN_SERVICE_URL` | URL base do Cofre (/token-service/oauth/v2) |
| `EREDE_API_URL` | URL base v2 (ex: `https://api.userede.com.br/erede/v2/transactions`) |
| `EREDE_CALLBACK_SECRET` | Opcional. Valida header X-Erede-Secret no webhook |
| `EREDE_TIMEOUT_MS` | Timeout em ms (default 15000) |
| `EREDE_PIX_EXPIRATION_HOURS` | Expiração de QR PIX (default 24h) |
| `EREDE_SOFT_DESCRIPTOR` | Texto na fatura do cliente |

**Autenticação:** OAuth 2.0 Bearer token (`client_credentials`) + header `Affiliation: {EREDE_CLIENT_ID}`.

O `EredeOAuthClient` obtém e renova o token automaticamente (singleton com cache interno). As chamadas ao `/token-service/oauth/v2` (Cofre) usam o mesmo Bearer obtido via `EREDE_OAUTH_URL`.

---

## Endpoints utilizados

| Método | Path | Descrição |
|---|---|---|
| `POST` | `/v2/transactions` | Criar transação (PIX ou cartão) |
| `GET` | `/v2/transactions/{tid}` | Consultar status de transação |
| `POST` | `/token-service/oauth/v2/tokenization` | Tokenizar cartão no Cofre |
| `GET` | `/token-service/oauth/v2/tokenization/{id}` | Consultar status de tokenização |
| `POST` | `/token-service/oauth/v2/tokenization/{id}/management` | Deletar tokenização (action=delete) |
| `POST` | `/api/erede/webhook` | Receber eventos da Rede (sem JWT). Headers: Request-ID (obrigatório) + X-Erede-Secret (opcional) |

---

## Payload de criação — PIX

```json
{
  "kind": "pix",
  "reference": "TPW-1234567890-abcd1234",
  "amount": 15000,
  "expirationDate": "2026-04-02T10:00:00.000Z"
}
```

**Resposta de sucesso:**
```json
{
  "tid": "abc123",
  "returnCode": "00",
  "returnMessage": "Aprovado",
  "reference": "TPW-1234567890-abcd1234",
  "pix": {
    "qrCode": "00020126...",
    "link": "https://...",
    "expirationDate": "2026-04-02T10:00:00.000Z"
  }
}
```

**Campos adicionais (quando disponíveis):**
- `nsu` — Número Sequencial Único gerado pela adquirente. Em PIX, costuma vir apenas no callback assíncrono após confirmação.
- `brand.authorizationCode` ou `authorizationCode` (raiz) — Código de autorização, tipicamente presente em transações com cartão.

Ambos os campos são persistidos em `Payment.nsu` e `Payment.authorizationCode` quando presentes na resposta de criação OU no callback.

---

## Payload de criação — Cartão de crédito

```json
{
  "kind": "credit",
  "reference": "TPW-1234567890-abcd1234",
  "amount": 52500,
  "installments": 2,
  "cardHolderName": "JOAO DA SILVA",
  "cardNumber": "4111111111111111",
  "expirationMonth": "12",
  "expirationYear": "2028",
  "securityCode": "123",
  "capture": true,
  "softDescriptor": "TUPPEWARE",
  "billing": {
    "name": "Joao da Silva",
    "document": "12345678901",
    "email": "joao@email.com",
    "address": {
      "street": "Rua Exemplo",
      "number": "S/N",
      "complement": "",
      "district": "Centro",
      "city": "São Paulo",
      "state": "SP",
      "zipCode": "01310100",
      "country": "BRA"
    }
  }
}
```

**Nota:** O campo `country` deve ser ISO alpha-3 (BRA, USA, ARG). A aplicação converte automaticamente de alpha-2.

---

## Códigos de retorno

| returnCode | Significado | Status local |
|---|---|---|
| `"00"` | Aprovado | `PAGO` |
| outros | Recusado / erro | `CANCELADO` |

**Webhook status numérico (callbacks assíncronos):**

| status | Significado | Status local |
|---|---|---|
| `0` | Aprovado | `PAGO` |
| `3` | Pendente | `PENDENTE` |
| `4` | Cancelado | `CANCELADO` |

---

## Tokenização de cartão (Cofre eRede — `/token-service/oauth/v2/tokenization`)

**Request:**
```json
{
  "cardNumber": "4111111111111111",
  "expirationMonth": "12",
  "expirationYear": "2028",
  "cardHolderName": "JOAO DA SILVA",
  "email": "joao@email.com",
  "securityCode": "123"
}
```

**Response (criação):**
```json
{
  "tokenizationId": "uuid-opaco",
  "status": "ACTIVE",
  "cardBrand": "VISA",
  "lastFour": "1111",
  "bin": "411111"
}
```

O `tokenizationId` é armazenado internamente em `saved_cards.tokenization_id` e **nunca** é exposto ao frontend. O status pode ser `PENDING` (confirmação assíncrona via webhook) ou `ACTIVE` (confirmado imediatamente).

**Consulta de status:** `GET /token-service/oauth/v2/tokenization/{tokenizationId}`

**Deleção:** `POST /token-service/oauth/v2/tokenization/{tokenizationId}/management` com body `{ "action": "delete" }`

---

## Pagamento com cartão tokenizado (savedCardId)

Quando o pagamento usa um cartão previamente salvo, o payload de criação de transação envia `cardToken` em vez de `cardNumber`:

```json
{
  "kind": "credit",
  "reference": "TPW-1234567890-abcd1234",
  "amount": 52500,
  "installments": 2,
  "cardToken": "token-opaco-da-erede",
  "securityCode": "123",
  "capture": true,
  "softDescriptor": "TUPPEWARE",
  "billing": { ... }
}
```

**Nota:** O nome do campo `cardToken` foi inferido do SDK PHP da eRede (`storageCard`). Precisa ser validado contra a sandbox real da API REST. Se o campo correto for diferente (ex: `storageCard`), ajustar em `ERedeService.buildCreditPayload`.

---

## Tratamento de erros

| Cenário | Comportamento |
|---|---|
| `response.ok === false` | Lança `AppError` com mensagem do gateway (502) |
| Timeout (AbortController) | Lança `AppError` 504 |
| Falha de rede | Lança `AppError` 503 |
| Credenciais ausentes | Lança `AppError` 500 antes de chamar o gateway |

---

## Validação de callbacks / Webhook

A eRede não usa HMAC. A validação atual verifica estrutura mínima (`tid` presente, `returnCode` definido) e idempotência via `Request-ID` (header obrigatório — eventos duplicados são ignorados se já processados).

Segurança adicional via header `X-Erede-Secret` (comparado com `EREDE_CALLBACK_SECRET` se configurado) + HTTPS + whitelist de IPs do gateway no firewall.

**Eventos de Cofre (tokenização):** o webhook também recebe eventos do Cofre (`tokenizationId`, `status`). O `EredeWebhookService.syncFromWebhook` atualiza `saved_cards.status` com base no evento recebido.

---

## Persistência de identificadores

| Campo | Origem | Tabela `payments` |
|---|---|---|
| TID | gerado pela Rede | `gateway_transaction_id` |
| NCU | gerado pelo Tuppeware (`TPW-{ts}-{userId}`) | `reference_num` |
| NSU | gerado pela adquirente/bandeira | `nsu` |
| authorizationCode | código de autorização da bandeira | `authorization_code` |

Todos são expostos automaticamente nas respostas de `GET /api/payment-history` e `GET /api/payment-history/:id`.
