# Design — Pagamentos Parciais

**Data:** 2026-04-22
**Status:** Aprovado para implementação

## Contexto e objetivo

Permitir que um usuário pague parcialmente uma dívida única via PIX, configurável pelo admin, com notificação via webhook a um sistema externo quando o pagamento for confirmado. O mesmo webhook também passa a notificar pagamentos totais, com um campo `paymentType` diferenciando os dois casos.

## Decisões de negócio (travadas no brainstorm)

1. **Modelagem do restante:** a própria `Debt` ganha `paidAmount`; permanece `PENDENTE` até `paidAmount == valor`, quando vira `PAGO`.
2. **Método:** somente PIX. Cartão (com ou sem parcelamento) continua exigindo pagamento total.
3. **Múltiplos parciais:** ilimitados por dívida. Cada parcial é um `Payment` independente; somam em `paidAmount` à medida que seus callbacks confirmam.
4. **Webhook global:** URL única configurada pelo admin; assinatura HMAC-SHA256 via secret também configurado.
5. **Escopo do webhook:** dispara em **todos** os pagamentos confirmados (parciais e totais), com `paymentType: "PARTIAL" | "FULL"` no payload.
6. **Feature flag global:** `partial_payment_enabled`. Quando desligada, a rota `/partial` retorna 403.
7. **Regra de mínimos** (na criação do parcial): `amount >= min_amount` E (`remaining_after == 0` OU `remaining_after >= min_remaining`).
8. **Retry do webhook:** 3 tentativas com backoff exponencial (0s, 2s, 8s); timeout 5s por tentativa; falha em todas = evento perdido (log apenas).
9. **Idempotência:** `eventId = payment.id`; consumidor deve dedupe por `eventId`.
10. **Webhook async:** executa via `setImmediate` após commit da transação; não bloqueia nem derruba o callback do gateway.

## Arquitetura

### Componentes novos
- Rota `POST /api/payments/partial` (`src/routes/paymentRoutes.ts`)
- `PaymentController.createPartial`
- `PaymentService.createPartial(userId, dto)`
- `WebhookDispatcher` (`src/services/WebhookDispatcher.ts`)
- `partialPaymentValidator` (`src/validators/partialPaymentValidator.ts`)

### Componentes alterados
- `PaymentService.create` — refactor para extrair helpers privados reusáveis:
  - `_callGatewayPix(amountCents, refNum, user)`
  - `_persistPayment(params)` aceitando `isPartial: boolean`
  - `_validateDebtsExist(debtIds)`
- `PaymentService.processGatewayCallback` — lógica nova para parcial (acumula `paidAmount`) e disparo do webhook pós-commit.
- `PaymentRepository.updateDebtPaidAmount(debtId, newPaidAmount, newStatus, tx)` (novo método, usa transação).
- `DebtRepository.findAll` — resposta inclui `paidAmount` e `remaining` computado.
- `SettingsService.ALLOWED_SETTINGS` — 5 chaves novas.

### Boundaries mantidos
- Controller valida forma, chama service.
- Service orquestra settings + débito + gateway + persistência + dispatch.
- Repository isola Prisma.
- `WebhookDispatcher` não conhece Prisma; recebe DTO pronto.

## Schema (Prisma)

```prisma
model Debt {
  // ...campos existentes...
  valor       Decimal    @db.Decimal(10, 2)
  paidAmount  Decimal    @db.Decimal(10, 2) @default(0) @map("paid_amount")
  status      DebtStatus @default(PENDENTE)
}

model Payment {
  // ...campos existentes...
  isPartial   Boolean @default(false) @map("is_partial")
}
```

Uma migração Prisma única: `migrations/YYYYMMDD_add_partial_payments/migration.sql`.

Em pagamento total, o callback seta `paidAmount = valor` por consistência (sempre). Em parcial, `paidAmount` incrementa por commit dentro de transação com lock otimista.

## Settings (novas chaves em `ALLOWED_SETTINGS`)

| Chave | Validação | Default | Descrição |
|---|---|---|---|
| `partial_payment_enabled` | `"true" \| "false"` | `"false"` | Feature flag |
| `partial_payment_min_amount` | decimal > 0 | — | Valor mínimo do parcial |
| `partial_payment_min_remaining` | decimal ≥ 0 | — | Valor mínimo que pode sobrar |
| `payment_webhook_url` | URL https válida | vazio (no-op) | Destino do webhook |
| `payment_webhook_secret` | string ≥ 16 chars | — | Secret HMAC |

Comportamento:
- Feature desligada → rota `/partial` retorna 403.
- `payment_webhook_url` vazio/ausente → dispatcher vira no-op (log debug).
- `payment_webhook_secret` ausente com URL setada → dispatcher aborta com log warn (não envia sem assinatura).

## Contrato HTTP

### `POST /api/payments/partial`

**Headers:** `Authorization: Bearer <jwt>`

**Body:**
```json
{
  "debtId": "uuid",
  "amount": 40.00
}
```

**Response 201:**
```json
{
  "paymentId": "uuid",
  "referenceNum": "TPW-...",
  "qrCode": "00020101...",
  "expiresAt": "2026-04-23T18:00:00.000Z"
}
```

**Errors:**

| HTTP | Condição |
|---|---|
| 400 | Amount inválido, viola mínimos, excede restante, débito já pago |
| 403 | Feature desabilitada |
| 404 | Débito não encontrado ou fora do escopo do usuário |
| 429 | Rate limit (5 req / 5 min) |

### `POST <payment_webhook_url>` (para o sistema externo)

**Headers:**
- `Content-Type: application/json`
- `X-Tuppeware-Event: payment.confirmed`
- `X-Tuppeware-Event-Id: <payment.id>`
- `X-Tuppeware-Timestamp: <unix-ms>`
- `X-Tuppeware-Signature: sha256=<hmac>`

**Body:**
```json
{
  "eventId": "uuid",
  "eventType": "payment.confirmed",
  "paymentType": "PARTIAL",
  "timestamp": "2026-04-22T18:30:00.000Z",
  "payment": {
    "id": "uuid",
    "referenceNum": "TPW-...",
    "method": "PIX",
    "amount": 40.00,
    "paidAt": "2026-04-22T18:30:00.000Z"
  },
  "debt": {
    "id": "uuid",
    "codigo": "1234",
    "valor": 100.00,
    "paidAmount": 40.00,
    "remaining": 60.00,
    "status": "PENDENTE"
  },
  "user": {
    "id": "uuid",
    "cpf": "12345678900"
  }
}
```

**Assinatura (compatível com padrão Stripe/GitHub):**
```
signedPayload = `${timestamp}.${jsonBody}`
hmac = HMAC-SHA256(signedPayload, payment_webhook_secret)
header = `sha256=${hmac.toString("hex")}`
```

## Fluxos

### Criação do parcial

1. `authMiddleware` → extrai `req.user`
2. `rateLimitMiddleware` (5/5min)
3. `partialPaymentValidator` → valida forma do body
4. `PaymentController.createPartial` → chama service
5. `PaymentService.createPartial`:
   1. Settings: `partial_payment_enabled === "true"` (senão 403)
   2. `debtRepository.findById(debtId)` com filtro de hierarquia (senão 404)
   3. `debt.status !== "PAGO"` (senão 400)
   4. `amount >= min_amount` (senão 400)
   5. `remaining = valor - paidAmount`; `amount <= remaining` (senão 400)
   6. `remainingAfter = remaining - amount`; aceita se `0` ou `>= min_remaining` (senão 400)
   7. `amountCents = Math.round(amount * 100)`
   8. `referenceNum = TPW-{Date.now()}-{userId.slice(0,8)}`
   9. `_callGatewayPix(amountCents, refNum, user)` → eRede
   10. `_persistPayment({ isPartial: true, subtotal: amount, fee: 0, totalValue: amount, method: "PIX", installments: 1, debtIds: [debtId], ... })`
   11. Retorna `{ paymentId, referenceNum, qrCode, expiresAt }`

### Callback do gateway

1. `POST /api/payments/callback/erede` (rota existente)
2. `PaymentService.processGatewayCallback`:
   1. Busca `Payment` por `referenceNum` / `gatewayTransactionId`
   2. Mapeia status do gateway
   3. Se confirmado (returnCode `"00"`):
      - Abre transação
      - `payment.status = PAGO`
      - Se `payment.isPartial`:
        - Lê `debt` com lock (otimista: `update where id AND paidAmount == atual`)
        - `paidAmountNovo = paidAmount + payment.totalValue`
        - `novoStatus = paidAmountNovo >= valor ? "PAGO" : debt.status`
        - `updateDebtPaidAmount(debtId, paidAmountNovo, novoStatus, tx)`
        - Em conflito (update retorna 0 linhas): relê e retry até N=3, erra depois
      - Se total: fluxo atual (marca debts como PAGO)
      - Commit
   4. Se cancelado (`status=4`): reverte `payment` para CANCELADO; **não** mexe em `paidAmount`
   5. Após commit: emite WebSocket event (como hoje)
   6. Após commit: `setImmediate(() => WebhookDispatcher.send(event).catch(log))`

### Concorrência

Dois callbacks simultâneos no mesmo débito (dois parciais independentes que confirmam ao mesmo tempo):
- Estratégia: **optimistic lock via `WHERE id = ? AND paidAmount = ?`**
- Se `updateMany` retorna 0: relê, recalcula, tenta de novo (até 3 tentativas)
- Evita `SELECT ... FOR UPDATE` explícito (Prisma+MariaDB tem suporte limitado) e evita duplicar soma

## Interações com features existentes

- **Hierarquia de visibilidade:** `createPartial` usa o mesmo lookup de `consultant` + filtro do `DebtService._buildWhereClause`. CONSULTOR só paga parcial das próprias dívidas; EMPRESARIA do distrito; etc.
- **Rate limit:** rota `/partial` aplica `rateLimitMiddleware` (5 req / 5 min).
- **Reopen:** funciona igual em parcial (gera novo PIX; `paidAmount` só sobe em confirmação).
- **Listagem de débitos:** resposta passa a incluir `paidAmount` e `remaining` (aditivo, sem breaking change).
- **Histórico de pagamentos:** cada item carrega `isPartial` (aditivo).
- **Cancelamento de parcial:** `Payment` vira `CANCELADO`; `paidAmount` não é tocado (só sobe em confirmação).

## Tratamento de erros

Todos via `AppError` (padrão do projeto), capturados pelo `errorHandler`:

| Cenário | HTTP | Mensagem |
|---|---|---|
| Feature desabilitada | 403 | "Pagamento parcial desabilitado" |
| Débito não encontrado / sem permissão | 404 | "Dívida não encontrada" |
| Débito já pago | 400 | "Dívida já paga" |
| Amount < min_amount | 400 | "Valor mínimo para pagamento parcial: R$ {X}" |
| Amount > remaining | 400 | "Valor excede o restante (R$ {Y})" |
| Viola min_remaining | 400 | "Após o parcial deve sobrar R$ 0 ou ≥ R$ {X}" |
| Settings inválidas no admin | 400 | Validação no `SettingsService` |

Webhook falhando não gera erro HTTP para o cliente; apenas log.

## Testes (TDD obrigatório — regra do projeto)

### Unit

`PaymentService.createPartial.test.ts`:
- Caminho feliz com valores válidos
- Feature flag off → 403
- debtId inexistente → 404
- Débito de outro distrito (EMPRESARIA) → 404
- Débito já PAGO → 400
- Amount < min_amount → 400
- Amount > remaining → 400
- Viola min_remaining → 400
- Amount == remaining (quita) → passa
- Múltiplos parciais acumulam em paidAmount

`PaymentService.processGatewayCallback.test.ts` (extensão):
- Callback de parcial: soma paidAmount, mantém PENDENTE
- Callback de último parcial: quita, vira PAGO
- Callback de pagamento total: comportamento atual preservado
- Callback cancelado em parcial: não mexe em paidAmount
- `WebhookDispatcher.send` chamado após commit (mock)

`WebhookDispatcher.test.ts`:
- Assinatura HMAC correta no header
- Retry 3x com backoff em 5xx
- Sucesso em 2xx
- Timeout 5s
- No-op quando URL ausente
- Aborta quando secret ausente (log warn)
- Payload `eventType` e `paymentType` corretos

`SettingsService.test.ts` (extensão):
- Novas chaves validam (bool, decimal > 0, URL https, secret ≥ 16)
- URL http puro → 400
- min_amount negativo → 400
- secret curto → 400

### Integration

`partial-payments.test.ts`:
- Fluxo completo com banco real: cria parcial → confirma callback → paidAmount sobe
- Dois parciais sequenciais quitam a dívida
- Concorrência: dois callbacks simultâneos não duplicam paidAmount
- Webhook recebido por servidor HTTP mockado com assinatura válida
- Feature off: rota `/partial` retorna 403

### Cobertura
Manter ≥ 90% linhas (patamar atual). Cada novo método com 100% de branches.

## Fora de escopo (deliberadamente)

- Webhook por consultor/tenant (só URL global)
- Fila persistente para retries de webhook (falha em 3 retries = perda documentada)
- Pagamento parcial via cartão (qualquer modalidade)
- Pagamento parcial em múltiplas dívidas simultâneas
- UI admin para configurar as chaves novas (usa endpoint genérico `PUT /admin/settings`)

## Impactos em docs

- `docs/design/architecture.md` — anotar fluxo de parcial
- `docs/project/requirements.md` — novos RFs (RF-30: pagamento parcial; RF-31: webhook de pagamentos confirmados)
- `docs/project/acceptance.md` — critérios rastreáveis
- Swagger (`src/config/swagger.ts`) — nova rota `/payments/partial`, campo `isPartial` em `Payment`, settings novos
