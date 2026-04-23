# Gateway eRede — Contrato e Integração

## Configuração

| Variável de ambiente | Descrição |
|---|---|
| `EREDE_PV` | Número do estabelecimento (PV) |
| `EREDE_INTEGRATION_KEY` | Chave de integração |
| `EREDE_API_URL` | URL base da API (ex: `https://api.userede.com.br/erede/v1/transactions`) |
| `EREDE_CALLBACK_SECRET` | Secret opcional para validação de callbacks |
| `EREDE_PIX_EXPIRATION_HOURS` | Horas de expiração do QR Code PIX |
| `EREDE_SOFT_DESCRIPTOR` | Texto que aparece na fatura do cartão |
| `EREDE_TIMEOUT_MS` | Timeout de requisições em ms |

**Autenticação:** Basic Auth com `Base64(PV:INTEGRATION_KEY)` no header `Authorization`.

---

## Endpoints utilizados

| Método | Path | Descrição |
|---|---|---|
| `POST` | `/transactions` | Criar transação (PIX ou cartão) |
| `GET` | `/transactions/{tid}` | Consultar status de transação |
| `POST` | `/tokens` | Tokenizar cartão de crédito |

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

## Tokenização de cartão

**Request:**
```json
{
  "cardNumber": "4111111111111111",
  "expirationMonth": "12",
  "expirationYear": "2028",
  "cardHolderName": "JOAO DA SILVA"
}
```

**Response:**
```json
{
  "token": "token-opaco",
  "last4digits": "1111",
  "brand": "VISA"
}
```

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

## Validação de callbacks

A eRede não usa HMAC. A validação atual verifica estrutura mínima (`tid` presente, `returnCode` definido). Segurança adicional deve ser garantida por HTTPS + whitelist de IPs do gateway no firewall.

---

## Persistência de identificadores

| Campo | Origem | Tabela `payments` |
|---|---|---|
| TID | gerado pela Rede | `gateway_transaction_id` |
| NCU | gerado pelo Tuppeware (`TPW-{ts}-{userId}`) | `reference_num` |
| NSU | gerado pela adquirente/bandeira | `nsu` |
| authorizationCode | código de autorização da bandeira | `authorization_code` |

Todos são expostos automaticamente nas respostas de `GET /api/payment-history` e `GET /api/payment-history/:id`.
