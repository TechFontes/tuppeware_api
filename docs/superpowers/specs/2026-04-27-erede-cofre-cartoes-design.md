# eRede — Migração total para OAuth + Cofre de Cartões

**Status:** todas as 6 seções aprovadas em 2026-04-30. Pronto pra writing-plans.
**Origem:** bug em produção `POST /users/me/saved-cards` retornava 503 `"Unexpected token '<', \"<?xml vers\"... is not valid JSON"`. Causa raiz: endpoint inexistente `/v1/tokens` (gerado por `baseUrl.replace('/transactions','/tokens')` em `src/services/ERedeService.ts:144`); a Rede respondia com XML de erro e o `response.json()` quebrava.

---

## Diagnóstico da causa raiz

A doc oficial atual da eRede (Swagger em https://developer.userede.com.br/e-rede atualizado em 24/03/2026) substituiu Basic Auth por OAuth 2.0 Client Credentials. Endpoint correto de tokenização é `POST /token-service/oauth/v2/tokenization` (não `/v1/tokens`).

**Validação contra sandbox (testado 2026-04-27 com credenciais clientId 54695492):**
- ✅ `POST /oauth2/token` → 200 OK, `expires_in: 1439s` (~24min), scope `ecommerce_transaction ecommerce_recurring`
- ✅ `POST /token-service/oauth/v2/tokenization` → 201 Created, `tokenizationId: 6d106c12-d705-4467-9137-de0841f41df8`
- ✅ `GET /token-service/oauth/v2/tokenization/{id}` → 200 OK, `tokenizationStatus: Active` (sandbox responde imediato)
- ✅ `POST /v2/transactions` (host `sandbox-erede.useredecloud.com.br`) com `cardToken` → `returnCode: "00"`, sem cryptogram

**Descoberta crítica não documentada:** header `Affiliation: {clientId}` é **obrigatório** em todas as chamadas (descoberto pelo erro `returnCode 26 "Affiliation: Required parameter missing"`).

> ⚠️ **Fonte de verdade:** ao trabalhar com a eRede, **sempre consulte o Swagger online no portal `developer.userede.com.br/e-rede`** — é o único contrato confiável. **Não use** os PDFs "Integration Manual" (v1.13/v1.16/v1.17/v1.21 etc) — são versões antigas e frequentemente desatualizadas em relação ao Swagger online. Quando a doc não cobrir um cenário, validar empiricamente contra a sandbox (`POST /v2/transactions` ou similar) e registrar o achado neste spec ou no CLAUDE.md (seção "Documentação externa — sempre a fonte atualizada"). Achados acumulados até 2026-05-01: `storageCard: 2` obrigatório no Cofre, `brand` é objeto no GET, `last4` (não `last4digits`), `billing.birthDate` opcional, `manageTokenization` delete bloqueado em sandbox.

---

## Decisões de escopo (fechadas)

| # | Decisão | Escolhido |
|---|---|---|
| 1 | Migração OAuth | **A — total** (todo `/v2/transactions` migra: PIX, cartão direto, parcial, cartão tokenizado). |
| 2 | Webhook | **A — implementar completo** (`POST /api/erede/webhook` + sync + auditoria/idempotência). |
| 3 | Credenciais | **A — sandbox prontas, produção será gerada antes do deploy.** |
| 4 | Esforço | "não economize esforços, oq for necessário ajustar da erede, faça agora" → escopo expandido para incluir campos novos no `Payment` e tabela de auditoria de webhook. |

**Credenciais sandbox (já testadas, válidas):**
- `EREDE_CLIENT_ID=54695492`
- `EREDE_CLIENT_SECRET=76b06b9bbc6b4a13913baaef506c98ea`

---

## Seção 1/6 — Arquitetura geral ✅ APROVADA

### Componentes novos
| Componente | Tipo | Responsabilidade |
|---|---|---|
| `EredeOAuthClient` | Service novo | Cache em memória do `access_token`. Renova ~60s antes de expirar. Único lugar que conhece `clientId`/`clientSecret`. |
| `ERedeService` (refator) | Service existente | Migrado para Bearer + `Affiliation`. Métodos: `tokenizeCardCofre`, `queryTokenization`, `manageTokenization`. Remove `tokenizeCard` antigo. |
| `EredeWebhookController` | Controller novo | `POST /api/erede/webhook`. Valida estrutura, dispara sync via `GET /tokenization/{id}`. |
| `EredeWebhookService` | Service novo | Sync: lê `tokenizationId` do payload, chama `queryTokenization`, atualiza `SavedCard`. |
| `eredeWebhookRoutes.ts` | Route nova | Monta `/erede/webhook`. **Sem `authMiddleware`** (chamada do gateway). |

### Componentes alterados
| Componente | Mudança |
|---|---|
| `SavedCardService.tokenizeAndSave` | Persiste com `tokenizationStatus: PENDING`, faz GET imediato pra promover a ACTIVE. |
| `SavedCardService.assertActiveForCharge` (novo) | Bloqueia cobrança se status ≠ ACTIVE; tenta sync on-demand antes de desistir. |
| `PaymentService.create` | Chama `assertActiveForCharge` quando vier `savedCardId`. `buildCreditPayload` recebe `cardToken`. |
| `ERedeService.buildCreditPayload` | Quando `cardToken` informado, **omite** `cardNumber`/`expirationMonth`/`expirationYear`/`cardHolderName`. Mantém `securityCode`. |
| `ERedeService.createTransaction` / `queryTransaction` | Migra de Basic para Bearer + Affiliation. |
| `config/erede.ts` + `.env.example` | Adiciona `EREDE_CLIENT_ID`, `EREDE_CLIENT_SECRET`, `EREDE_OAUTH_URL`, `EREDE_TOKEN_SERVICE_URL`. **Remove** `EREDE_PV` e `EREDE_INTEGRATION_KEY`. |

### Fluxo "salvar cartão"
```
POST /users/me/saved-cards
  → UserController
  → SavedCardService.tokenizeAndSave
      → ERedeService.tokenizeCardCofre (Bearer + Affiliation)
          → EredeOAuthClient.getAccessToken (cache)
          → POST /token-service/oauth/v2/tokenization
      ← { tokenizationId }
      → SavedCardRepository.create({ tokenizationId, status: PENDING })
      → ERedeService.queryTokenization (sync imediata)
      → SavedCardRepository.updateStatus
  ← 201 { id, last4, brand, status }
```

### Fluxo "cobrar com cartão salvo"
```
POST /payments (com savedCardId)
  → PaymentService.create
      → SavedCardService.assertActiveForCharge(savedCardId) → 422 se PENDING/INACTIVE/FAILED
      → ERedeService.buildCreditPayload({ cardToken: savedCard.tokenizationId, securityCode })
      → ERedeService.createTransaction (Bearer)
```

### Fluxo "webhook"
```
POST /api/erede/webhook (sem JWT)
  → EredeWebhookController.handle
      → idempotência por header Request-ID
      → EredeWebhookService.sync(tokenizationId)
          → ERedeService.queryTokenization
          → SavedCardRepository.updateByTokenizationId
  ← 200 OK rápido (idempotente)
```

---

## Seção 2/6 — Schema de banco ✅ APROVADA (com expansão sob "não economize esforços")

### `SavedCard` (refator)

**Note (correção pós-review):** o `@@index([tokenizationId])` original foi removido — `@unique` já cria um índice BTREE em MySQL, índice extra é redundante.

```prisma
enum SavedCardStatus { PENDING ACTIVE INACTIVE FAILED }

model SavedCard {
  id              String          @id @default(uuid())
  userId          String          @map("user_id")
  tokenizationId  String          @unique @map("tokenization_id")  // ex-"token"
  status          SavedCardStatus @default(PENDING)
  email           String                                            // novo, exigido pelo Cofre
  bin             String?                                           // novo, vem do GET
  cardBrand       String?         @map("card_brand")
  lastFour        String          @map("last_four")
  holderName      String          @map("holder_name")
  brandTid        String?         @map("brand_tid")                 // novo, útil pra dispute
  lastSyncedAt    DateTime?       @map("last_synced_at")            // novo
  createdAt       DateTime        @default(now()) @map("created_at")
  updatedAt       DateTime        @updatedAt      @map("updated_at") // novo
  user User @relation(fields: [userId], references: [id])
  @@map("saved_cards")
}
```

### `Payment` (campos novos da API v2)
```prisma
model Payment {
  // ... existentes ...
  brandTid           String?    @map("brand_tid")           // novo
  cardBin            String?    @map("card_bin")            // novo, BIN devolvido em cobrança com cardToken
  transactionLinkId  String?    @map("transaction_link_id") // novo, ID interno Rede
  savedCardId        String?    @map("saved_card_id")       // novo, FK
  savedCard          SavedCard? @relation(fields: [savedCardId], references: [id])
}
```

### Nova tabela `EredeWebhookEvent` (auditoria + idempotência)
```prisma
enum EredeWebhookEventType { TOKENIZATION TRANSACTION }

model EredeWebhookEvent {
  id              String                @id @default(uuid())
  externalId      String                @unique @map("external_id")  // header Request-ID
  eventType       EredeWebhookEventType @map("event_type")
  events          Json                                                // ["PV.TOKENIZACAO-BANDEIRA"]
  payload         Json
  processed       Boolean               @default(false)
  processedAt     DateTime?             @map("processed_at")
  errorMessage    String?               @map("error_message") @db.Text
  receivedAt      DateTime              @default(now()) @map("received_at")
  @@map("erede_webhook_events")
  @@index([eventType, processed])
}
```

**Justificativa:** doc da Rede diz que retenta 12x a cada 30s + 1x/h por 14 dias → sem dedupe processamos N vezes.

### Migrations
1. `20260427_savedcard_cofre_fields` — **ALTER** (decidido em 2026-04-30 — preserva dados existentes mesmo que feature nunca tenha funcionado de verdade):
   - `ADD COLUMN tokenization_id VARCHAR UNIQUE`, `status ENUM(...) DEFAULT 'PENDING'`, `email VARCHAR NULL`, `bin VARCHAR NULL`, `brand_tid VARCHAR NULL`, `last_synced_at DATETIME NULL`, `updated_at DATETIME ON UPDATE CURRENT_TIMESTAMP`
   - `UPDATE saved_cards SET tokenization_id = token` (rename via copy)
   - `UPDATE saved_cards sc JOIN users u ON sc.user_id = u.id SET sc.email = u.email` (backfill email)
   - `UPDATE saved_cards SET status = 'PENDING'` (força sync no primeiro uso via `assertActiveForCharge`)
   - `DROP COLUMN token` ao final, depois de validar que `tokenization_id` populado em todas as linhas
2. `20260427_payment_v2_fields` — adiciona campos novos
3. `20260427_erede_webhook_events` — cria tabela

**Pendência conhecida:** DB de testes offline (commit `15db847`). Migrations rodam em dev quando o usuário invocar `prisma:migrate dev` localmente; prod via `prisma:migrate deploy` no procedimento de deploy do CLAUDE.md.

---

## Seção 3/6 — `EredeOAuthClient` + refator do `ERedeService` ✅ APROVADA

### 3.1 `EredeOAuthClient` (novo, `src/services/EredeOAuthClient.ts`)

```ts
class EredeOAuthClient {
  async getAccessToken(): Promise<string>
  invalidate(): void
}
```

**Estado:** `cachedToken`, `expiresAt` (epoch ms; renova 60s antes), `inflight` (dedupe de chamadas concorrentes).

**Comportamento:**
- Cache hit se `cachedToken && expiresAt > now + 60s`
- Senão: `POST /oauth2/token` com `Basic Base64(clientId:clientSecret)` + `grant_type=client_credentials`
- Resposta: `{ access_token, expires_in }`. Calcula `expiresAt = now + expires_in*1000`
- Dedupe via `inflight` Promise (evita N requests simultâneos no boot)
- Erros: 4xx → `AppError 500`. 5xx/timeout → `AppError 503`
- Timeout: usa `eredeTimeoutMs`

### 3.2 `ERedeService` refator

**Removido:** `buildBasicAuth()`, `tokenizeCard()` antigo (origem do bug).

**Helper privado:**
```ts
private async authHeaders(): Promise<{ Authorization: string; Affiliation: string }> {
  return {
    Authorization: `Bearer ${await oauthClient.getAccessToken()}`,
    Affiliation: eredeClientId,
  }
}
```

**Retry em 401:** se `response.status === 401`, chama `oauthClient.invalidate()` e tenta 1x mais. Sem loop.

**Defesa contra resposta não-JSON (root cause defense):**
```ts
const contentType = response.headers.get('content-type') ?? '';
if (!contentType.includes('application/json')) {
  const body = await response.text();
  throw new AppError(
    `eRede retornou resposta não-JSON (status ${response.status}, content-type ${contentType}): ${body.slice(0, 200)}`,
    StatusCodes.BAD_GATEWAY,
  );
}
const json = await response.json();
```
Aplicado em **TODOS** os métodos. Mata o bug original na raiz.

**Métodos novos:**
```ts
async tokenizeCardCofre(params: {
  email: string; cardNumber: string; expirationMonth: string;
  expirationYear: string; cardholderName: string; securityCode?: string;
}): Promise<{ tokenizationId: string }>

async queryTokenization(tokenizationId: string): Promise<{
  tokenizationId: string;
  status: 'PENDING' | 'ACTIVE' | 'INACTIVE' | 'FAILED';
  bin?: string; last4?: string; brand?: string; brandTid?: string;
  lastModifiedDate?: string; raw: Record<string, unknown>;
}>

async manageTokenization(tokenizationId: string, action: 'delete', reason?: number):
  Promise<{ returnCode: string; returnMessage: string }>
```

**Mapeamento de status:**
```
"Pending"    → PENDING
"Active"     → ACTIVE
"Inactive"   → INACTIVE
"Suspended"  → INACTIVE   (UX-equivalente)
"Failed"     → FAILED
```

**`buildCreditPayload` ajuste:** quando `cardToken` informado, omite `cardNumber`/`expirationMonth`/`expirationYear`/`cardHolderName`. Mantém `securityCode`. Sem cryptogram (Cofre dispensa).

**`createTransaction` host:** `https://sandbox-erede.useredecloud.com.br/v2/transactions` (sandbox) / `https://api.userede.com.br/erede/v2/transactions` (prod).

### 3.3 Config (`.env.example`)
```env
EREDE_CLIENT_ID=seu_client_id          # também usado no header Affiliation
EREDE_CLIENT_SECRET=seu_client_secret
EREDE_OAUTH_URL=https://rl7-sandbox-api.useredecloud.com.br/oauth2/token
EREDE_TOKEN_SERVICE_URL=https://rl7-sandbox-api.useredecloud.com.br/token-service/oauth/v2
EREDE_API_URL=https://sandbox-erede.useredecloud.com.br/v2/transactions
EREDE_TIMEOUT_MS=15000
EREDE_CALLBACK_SECRET=change_me
EREDE_PIX_EXPIRATION_HOURS=24
EREDE_SOFT_DESCRIPTOR=Tuppeware
```
Removido: `EREDE_PV`, `EREDE_INTEGRATION_KEY`.

### 3.4 Catálogo de erros
| Cenário | StatusCode local | Mensagem |
|---|---|---|
| Credenciais OAuth ausentes | 500 | "Credenciais eRede OAuth não configuradas" |
| OAuth retorna 401 | 500 | "Credenciais eRede OAuth inválidas" |
| Token API retorna 26 (affiliation missing) | 500 | "Configuração inválida: Affiliation header" |
| Token API 4xx com `returnCode` | 400/422 | repassa `returnMessage` da Rede |
| Token API 5xx | 502 | "Erro no gateway eRede" |
| Timeout | 504 | "Timeout ao conectar com a eRede" |
| Resposta não-JSON | 502 | mensagem detalhada (root cause defense) |

---

## Seção 4/6 — `SavedCardService` + rotas + controller ✅ APROVADA

### 4.1 `SavedCardRepository` (ajustes)
```ts
class SavedCardRepository {
  // existentes
  create(data: CreateSavedCardInput): Promise<SavedCard>
  findById(id: string): Promise<SavedCard | null>
  findByUser(userId: string): Promise<SavedCard[]>
  delete(id: string): Promise<void>

  // novos
  findByTokenizationId(tokenizationId: string): Promise<SavedCard | null>
  updateStatus(id: string, data: {
    status: SavedCardStatus; bin?: string; cardBrand?: string;
    lastFour?: string; brandTid?: string;
  }): Promise<SavedCard>
  findActiveForUser(userId: string, savedCardId: string): Promise<SavedCard | null>
}
```

### 4.2 `SavedCardService` (refator)

**API pública:**
```ts
class SavedCardService {
  tokenizeAndSave(params: { userId, email, cardNumber, expMonth, expYear, holderName, securityCode? }): Promise<SavedCardPublicView>
  listByUser(userId): Promise<SavedCardPublicView[]>
  deleteCard(userId, savedCardId): Promise<void>
  syncFromWebhook(tokenizationId): Promise<void>
  assertActiveForCharge(userId, savedCardId): Promise<SavedCard>
}
```

**`SavedCardPublicView`** (DTO, **nunca expõe `tokenizationId`**):
```ts
{ id, status, cardBrand, lastFour, holderName, bin, createdAt }
```

**`tokenizeAndSave`:**
1. `eRedeService.tokenizeCardCofre(...)` → `{ tokenizationId }`
2. `repository.create({ status: PENDING, ... })`
3. **Sync imediato best-effort:** `queryTokenization` → `updateStatus`
4. Retorna view (já com status atualizado se sync funcionou)

**`assertActiveForCharge`:**
```ts
const card = await repository.findActiveForUser(userId, savedCardId);
if (!card) throw 404;
if (card.status !== 'ACTIVE') {
  await this.syncFromWebhook(card.tokenizationId);  // sync on-demand
  const refreshed = await repository.findById(savedCardId);
  if (refreshed?.status !== 'ACTIVE') {
    throw 422 (`Cartão não está ativo (status: ${refreshed?.status})`);
  }
  return refreshed;
}
return card;
```

**`deleteCard`:**
1. Busca + verifica ownership
2. `manageTokenization(tokenizationId, 'delete', 1)` (best-effort, loga se falhar)
3. `repository.delete(id)` — sempre executa

**`syncFromWebhook`:**
```ts
const card = await repository.findByTokenizationId(tokenizationId);
if (!card) return; // ignora — pode ser de outro PV
const remote = await eRedeService.queryTokenization(tokenizationId);
await repository.updateStatus(card.id, { status, bin, cardBrand, brandTid, lastSyncedAt: new Date() });
```

### 4.3 `UserController`
`POST /users/me/saved-cards` passa `email: req.user.email`. Validator aceita `securityCode` opcional.

### 4.4 Rotas afetadas
| Rota | Mudança |
|---|---|
| `POST /api/users/me/saved-cards` | Mesmo contrato; response inclui `status` (campo novo). |
| `GET /api/users/me/saved-cards` | Mesmo contrato; response inclui `status`. |
| `DELETE /api/users/me/saved-cards/:id` | Mesmo contrato; chama `manageTokenization('delete')`. |
| `POST /api/payments` | Quando `savedCardId`, valida status `ACTIVE`; 422 se PENDING/INACTIVE/FAILED. |

**Frontend:** só **adicionando** `status` (não breaking). Memória: contratos atuais não devem mudar.

### 4.5 Integração com `PaymentService`
```ts
// dentro de create()
if (savedCardId) {
  const card = await savedCardService.assertActiveForCharge(userId, savedCardId);
  // buildCreditPayload recebe cardToken: card.tokenizationId
}
// após cobrança bem-sucedida:
await paymentRepository.update(payment.id, {
  savedCardId: card.id,
  cardBin: gatewayResponse.cardBin,
  brandTid: gatewayResponse.brandTid,
  transactionLinkId: gatewayResponse.transactionLinkId,
});
```

**Pré-requisito:** `parseResponse` no `ERedeService` (privado) deve ser estendido pra extrair `cardBin`, `brandTid`, `transactionLinkId` do JSON da Rede e devolver no `ERedeTransactionResponse`. Tipos em `src/types/erede.ts` ganham os campos opcionais. Ajuste cabe na Task 8 (refator do `createTransaction`).

---

## Seção 5/6 — Webhook controller + idempotência ✅ APROVADA

### 5.1 Rota
`POST /api/erede/webhook` — montada em `src/routes/eredeWebhookRoutes.ts`.
- **Sem `authMiddleware`** (chamada do gateway)
- **Sem rate limit** (a Rede pode reentregar agressivamente: 12x a cada 30s + 1x/h por 14 dias)

### 5.2 Validações de entrada (em ordem)
1. **Header `X-Erede-Secret`** — exigido somente se `EREDE_CALLBACK_SECRET` está configurado no `.env`. Sem secret configurado, aceita qualquer chamada (dev/sandbox). Falha → `401` `"Webhook não autorizado"`.
2. **Header `Request-ID`** — obrigatório sempre. Falha → `400` `"Request-ID obrigatório"`.
3. **Body com `eventType` reconhecido** — prefixo `PV.TOKENIZACAO-*` ou `PV.TRANSACAO-*`. Falha → `400` `"Evento não suportado"`.

Erros de validação **não** persistem `EredeWebhookEvent` (não há nada a auditar — provável chamador externo malicioso/probe).

### 5.3 Idempotência via `Request-ID`
Lookup em `EredeWebhookEvent.externalId` (UNIQUE):

| Estado | Ação | Resposta |
|---|---|---|
| Não existe | Cria com `processed=false`, segue pra processamento | depende do processamento |
| Existe `processed=true` | Não reprocessa, log info | `200 OK` `{ status: "ok", duplicate: true }` |
| Existe `processed=false` | Re-tenta processar (Rede já retentou — falhou antes) | depende do processamento |

### 5.4 Eventos processados (ambos os tipos)
- `PV.TOKENIZACAO-*` → `EredeWebhookService.syncTokenization(tokenizationId)`
  - `eRedeService.queryTokenization(tokenizationId)`
  - `savedCardRepository.updateStatus(card.id, { status, bin, cardBrand, brandTid, lastSyncedAt: new Date() })`
  - Se card não encontrado por `tokenizationId` → ignora silenciosamente (pode ser de outro PV) e marca `processed=true`
- `PV.TRANSACAO-*` → `EredeWebhookService.syncTransaction(tid)`
  - `eRedeService.queryTransaction(tid)`
  - `paymentRepository.updateByTid(tid, { status: mapStatusToLocal(returnCode, status) })`
  - Se payment não encontrado → ignora e marca `processed=true`

**Pré-requisitos a criar:**
- `paymentRepository.updateByTid(tid, data)` — método novo (a tabela `payments` já tem coluna `tid`); cabe na Task 14 ou adicionar à Task 15.
- Helper pra extrair `tokenizationId` ou `tid` do `payload` cru (formato exato em `docs/design/gateway-erede.md` ou descobrir empiricamente; usar campo `tokenizationId`/`tid` do body como primeiro guess; se ausente, marca `processed=false` com mensagem "payload sem identificador" — caso defensivo).

### 5.5 Tratamento de erro no processamento

| Resultado | Persistência | Resposta ao gateway |
|---|---|---|
| Sucesso | `processed=true`, `processedAt=now` | `200 OK` `{ status: "ok" }` |
| Falha (timeout, Rede 5xx, DB indisponível, resposta não-JSON) | `processed=false`, `errorMessage=<msg>` | `500` `{ status: "error", message: <msg> }` |

A resposta `5xx` aciona o retry built-in da Rede (12x/30s + 14d). A próxima entrega cai no caminho "duplicata com `processed=false`" → re-tenta processar. Quando finalmente der certo, marca `processed=true` e a Rede para.

### 5.6 `EredeWebhookEvent` — fonte primária de auditoria
- `externalId` UNIQUE = idempotência por `Request-ID`
- `payload` Json = body cru recebido (debug)
- `events` Json = array `["PV.TOKENIZACAO-BANDEIRA", ...]`
- `processed=false` + `errorMessage` = ferramenta de diagnóstico (`SELECT * FROM erede_webhook_events WHERE processed=false ORDER BY received_at DESC`)

### 5.7 Componentes
| Componente | Tipo | Responsabilidade |
|---|---|---|
| `eredeWebhookRoutes.ts` | Route | Monta `POST /api/erede/webhook`, sem middleware de auth |
| `EredeWebhookController` | Controller | Validações 5.2, lookup idempotência 5.3, dispatch por tipo de evento, persistência do estado final |
| `EredeWebhookService` | Service | `syncTokenization(id)`, `syncTransaction(tid)` — orquestram query na Rede + update local |
| `EredeWebhookRepository` | Repository (novo) | `findByExternalId`, `create`, `markProcessed`, `markFailed` |

### 5.8 Catálogo de erros (controller)

| Cenário | Status | Body |
|---|---|---|
| Secret configurado, header ausente/divergente | 401 | `{ status: "fail", message: "Webhook não autorizado" }` |
| `Request-ID` ausente | 400 | `{ status: "fail", message: "Request-ID obrigatório" }` |
| `eventType` não reconhecido | 400 | `{ status: "fail", message: "Evento não suportado" }` |
| Body JSON malformado | 400 | (handled pelo `entity.parse.failed` no `errorHandler`) |
| Erro durante processamento | 500 | `{ status: "error", message: <errorMessage> }` |
| Sucesso novo evento | 200 | `{ status: "ok" }` |
| Sucesso duplicata já processada | 200 | `{ status: "ok", duplicate: true }` |

---

## Seção 6/6 — Estratégia de testes + roteiro TDD ✅ APROVADA

### 6.1 Cobertura de testes

**Testes unitários** (Vitest + mocks) — única camada coberta nesse plano. Cobre:
- `EredeOAuthClient` (cache, dedupe inflight, expires_in − 60s, 401 invalida, timeout, 4xx/5xx)
- `ERedeService` (todos os métodos novos e refatorados, content-type guard, retry em 401, mapeamento de status)
- `SavedCardRepository` (métodos novos via mock de Prisma)
- `SavedCardService` (`tokenizeAndSave` com sync best-effort, `assertActiveForCharge` com sync on-demand, `deleteCard` com manage best-effort, `syncFromWebhook`)
- `EredeWebhookController` (validações 5.2, idempotência 5.3, dispatch por tipo, persistência)
- `EredeWebhookService` (sync token, sync transação, ignorar entidades não encontradas)
- `PaymentService.create` integração com `assertActiveForCharge` + persistir campos novos

**Testes de integração** — **NÃO escritos nesse plano**. Risco aceito: webhook end-to-end e DB real ficam sem cobertura automatizada. **Validação manual em sandbox eRede antes do deploy de prod** (cobre fluxo "salvar cartão real → cobrar com cardToken → receber webhook → checar status no DB"). Pendência herdada: DB de testes offline (commit `15db847`) continua bloqueada.

### 6.2 Mock de `fetch`

Padrão de teste:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

it('faz POST /oauth2/token com Basic auth', async () => {
  (fetch as Mock).mockResolvedValueOnce(new Response(
    JSON.stringify({ access_token: 'xyz', expires_in: 1439 }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  ));

  const token = await oauthClient.getAccessToken();
  expect(token).toBe('xyz');
  expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining('/oauth2/token'),
    expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: expect.stringMatching(/^Basic /) }),
    }),
  );
});
```

Cada cenário (success, 4xx, 5xx, timeout via `AbortController`, content-type não-JSON, payload sem campo X) é um `it` separado.

### 6.3 Roteiro TDD (alto nível)

Cada task = 1 commit (RED+GREEN+REFACTOR juntos). Ordem:

| # | Task | Resultado |
|---|---|---|
| 1 | Migration `20260427_savedcard_cofre_fields` (ALTER) — adiciona colunas, backfill `tokenization_id <- token`, backfill `email` via JOIN com `users`, status PENDING, **DROP coluna `token`** ao final | `prisma:migrate dev` rodando, schema novo |
| 2 | Migration `20260427_payment_v2_fields` (ALTER `payments`) | colunas `brand_tid`, `card_bin`, `transaction_link_id`, `saved_card_id` |
| 3 | Migration `20260427_erede_webhook_events` (CREATE TABLE) + enum `EredeWebhookEventType` | tabela e índices |
| 4 | `EredeOAuthClient` | service novo, testes unit |
| 5 | `ERedeService.tokenizeCardCofre` (Bearer + Affiliation + content-type guard + retry 401) | método novo |
| 6 | `ERedeService.queryTokenization` | método novo |
| 7 | `ERedeService.manageTokenization` | método novo |
| 8 | Refator `ERedeService.createTransaction` migrado pra `/v2/transactions` + Bearer + content-type guard | método existente atualizado, testes existentes ajustados |
| 9 | Refator `ERedeService.queryTransaction` idem | idem |
| 10 | `ERedeService.buildCreditPayload` ajuste — quando `cardToken`, omite `cardNumber`/`expirationMonth`/`expirationYear`/`cardHolderName` | método existente atualizado |
| 11 | `SavedCardRepository` métodos novos (`findByTokenizationId`, `updateStatus`, `findActiveForUser`) | repo |
| 12 | `SavedCardService.tokenizeAndSave` refator (sync imediato best-effort) + `SavedCardPublicView` DTO | service refatorado |
| 13 | `SavedCardService.assertActiveForCharge` + `syncFromWebhook` + `deleteCard` ajuste com `manageTokenization` best-effort | service ampliado |
| 14 | `EredeWebhookRepository` + `EredeWebhookService` + `EredeWebhookController` + rota + montar em `app.ts` | webhook end-to-end (unit) |
| 15 | `PaymentService.create` integração com `assertActiveForCharge` quando `savedCardId` + persistir `brandTid`/`cardBin`/`transactionLinkId`/`savedCardId` | integração final |
| 16 | Atualizar `.env.example` (remove `EREDE_PV`/`EREDE_INTEGRATION_KEY`, adiciona OAuth vars) + atualizar `docs/design/gateway-erede.md` + atualizar Swagger das rotas afetadas | docs alinhadas |

### 6.4 Aproveitamento dos 344 testes existentes

Testes existentes que tocam `ERedeService` (ex: `ERedeService.test.ts`, `PaymentService.test.ts`, integração de pagamentos) **continuam passando**. Ajustes necessários ficam nas tasks que refatoram (8, 9, 10, 15) — RED é o teste já existente quebrando após mudança, GREEN é ajustar mocks para nova API (Bearer em vez de Basic, response shape v2). Não há remoção de cobertura.

### 6.5 Ordem de mocks ajustados em testes existentes

- Tasks 8/9: `fetch` mock no `ERedeService.test.ts` precisa retornar `headers: { 'content-type': 'application/json' }` (content-type guard novo).
- Task 8/9: testes que mockam `Authorization: 'Basic ...'` mudam pra `Bearer <token>` + `Affiliation: <pv>`.
- Task 10: testes existentes de `buildCreditPayload` ganham caso "com `cardToken`".
- Task 15: testes de `PaymentService.create` ganham caso "com `savedCardId`" (assert chama `assertActiveForCharge`, persiste campos novos).

### 6.6 Critério de done por task

Cada task TDD só fecha quando:
1. `npm run test` passa **toda** a suite (não só o teste novo)
2. `npm run lint` sem erros
3. Diff revisado pelo agente: sem dead code, sem comentários explicando "o que" o código faz
4. Commit criado seguindo padrão dos commits recentes (`feat(erede):`, `refactor(erede):`, `test(erede):`)

### 6.7 Validação final pré-deploy

Antes do deploy de prod (não é task do plano, mas pré-requisito de aceitação):
1. Rodar suite local: `npm run test` (~344 + novos)
2. Build: `npm run build`
3. Manual sandbox: rodar `EredeOAuthClient.getAccessToken()` em REPL local com credenciais sandbox → 200
4. Manual sandbox: `POST /api/users/me/saved-cards` end-to-end → 201 + `status: ACTIVE` (sync imediato funcionou)
5. Manual sandbox: `POST /api/payments` com `savedCardId` → `returnCode: "00"`
6. Manual sandbox: simular webhook com `curl` (status PENDING → ACTIVE) → `200 OK`, registro em `erede_webhook_events`
7. Trocar credenciais pra prod, deploy, smoke test

---

## Status do design

**Todas as 6 seções aprovadas.** Spec pronto pra writing-plans.

**Não esquecer (referência rápida durante implementação):**
- Webhook NÃO usa `authMiddleware` — chamado pelo gateway
- `Affiliation` header obrigatório (não está na doc oficial!)
- `EREDE_CALLBACK_SECRET` opcional via header customizado no controller
- Status `Suspended` da eRede mapeia pra `INACTIVE` local
- `tokenizationId` jamais aparece em response (DTO `SavedCardPublicView`)
- Migration #1 é ALTER (não DROP+CREATE) — preserva dados existentes mesmo que feature nunca tenha funcionado de verdade
- Pendência DB de testes (CLAUDE.md / commit `15db847`) — não resolvida nesse plano
