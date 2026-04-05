# Design: Rota de Salvar Cartão, Pagamento com Cartão Salvo e Correções

**Data:** 2026-04-05
**Status:** Aprovado

---

## Contexto

O sistema já tokeniza cartões como efeito colateral de pagamentos (`saveCard: true`), mas não oferece rota dedicada para salvar um cartão. Além disso, não é possível pagar usando um cartão previamente salvo. O Swagger contém inconsistências herdadas de migrações anteriores de gateway.

---

## RF-28 — Rota dedicada para salvar cartão

### Endpoint

`POST /api/users/me/saved-cards` (autenticado)

### Request body

```json
{
  "cardNumber": "4111111111111111",
  "expMonth": "12",
  "expYear": "2028",
  "holderName": "JOAO DA SILVA"
}
```

### Validação (express-validator)

| Campo | Regra |
|---|---|
| `cardNumber` | string, obrigatório, 13-19 dígitos |
| `expMonth` | string, obrigatório, 01-12 |
| `expYear` | string, obrigatório, 4 dígitos, não expirado |
| `holderName` | string, obrigatório, min 2 chars |

### Fluxo

1. `UserController.createSavedCard` recebe request
2. Chama `SavedCardService.tokenizeAndSave({ userId, cardNumber, expMonth, expYear, holderName })`
3. `ERedeService.tokenizeCard` faz `POST /tokens` na eRede
4. Token salvo no banco (ou retorna existente se duplicado)
5. Retorna `201 Created` com `{ id, lastFour, cardBrand, holderName, createdAt }`

### Segurança

- Token opaco da eRede nunca é exposto ao frontend
- Response inclui apenas `id`, `lastFour`, `cardBrand`, `holderName`, `createdAt`

---

## RF-29 — Pagamento com cartão salvo

### Mudança no CreatePaymentDTO

Novo campo opcional:

```typescript
savedCardId?: string; // UUID do cartão salvo
```

### Regras

- Quando `savedCardId` presente + `method: CARTAO_CREDITO`:
  - `card.number`, `card.expMonth`, `card.expYear`, `card.holderName` → não obrigatórios
  - `card.cvv` → **obrigatório** (PCI: CVV nunca é armazenado)
  - `billing` → continua obrigatório
- Quando `savedCardId` ausente: comportamento atual mantido

### Fluxo no PaymentService.create

1. Se `savedCardId` presente, busca cartão via `savedCardRepository.findById`
2. Valida que `card.userId === userId` (403 se não pertence)
3. Valida que `card.cvv` presente no body
4. Monta payload para eRede usando token do cartão salvo

### Mudança no ERedeService.buildCreditPayload

- Novo campo opcional `cardToken` nos params
- Quando `cardToken` presente, envia no payload em vez de `cardNumber`
- Demais campos (amount, installments, billing, cvv) permanecem iguais

### Validação ajustada (paymentValidator)

- Se `savedCardId` presente: só exige `card.cvv`
- Se `savedCardId` ausente: exige todos os campos de `card` como hoje

---

## Correções no Swagger

| Local | De | Para |
|---|---|---|
| `info.description` | "MaxiPago" | "eRede" |
| `CreatePaymentDTO.properties` | (sem `saveCard`, sem `savedCardId`) | Adicionar ambos |
| `Payment.gatewayProvider.enum` | `['MAXIPAGO', 'ASAAS']` | `['EREDE']` |
| `Payment.properties` | (sem `qrCode`) | Adicionar `qrCode: string, nullable` |
| `User.role.enum` | `['ADMIN', 'EMPRESARIA', 'LIDER', 'CONSULTOR']` | Adicionar `'GERENTE'` |

---

## Testes a criar

### Novos arquivos

1. **`rateLimitMiddleware.test.ts`** — app express mínimo com supertest; valida bloqueio após N requests, valida key por userId, valida response shape
2. **`PaymentHistoryController.test.ts`** — mock PaymentService; testa `index` (paginação), `show` (200/403/404), `reopen` (200/400/404)

### Extensões em arquivos existentes

3. **`SavedCardService.test.ts`** — cenários para tokenização standalone (sucesso, duplicado, falha gateway)
4. **`PaymentService.test.ts`** — cenários com `savedCardId` (sucesso, cartão não encontrado, cartão de outro user, cvv ausente)
5. **Validator tests** — novo `savedCardValidator.test.ts` + ajustes no paymentValidator para `savedCardId`

---

## Atualização da auditoria

- Atualizar contagem de testes (de 123 baseline para contagem atual + novos)
- Marcar gaps resolvidos
- Adicionar RF-28 e RF-29 à tabela
- Atualizar status dos gaps remanescentes

---

## Fora de escopo

- Alteração de contratos de rotas existentes (RNF-19)
- Pagamento recorrente / assinatura
- Múltiplas transações separadas por débito (pagamento unificado já funciona)
