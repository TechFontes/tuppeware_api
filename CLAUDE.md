# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Context Files

Read these files at the start of every session to understand the project:

- [`docs/project/scope.md`](docs/project/scope.md) — visão do produto, contexto de negócio, papéis, limites
- [`docs/project/requirements.md`](docs/project/requirements.md) — requisitos funcionais (RF-01..N) e não-funcionais (RNF-01..N)
- [`docs/project/acceptance.md`](docs/project/acceptance.md) — critérios de aceitação rastreáveis por feature
- [`docs/design/architecture.md`](docs/design/architecture.md) — camadas, fluxo de pagamento, hierarquia de visibilidade
- [`docs/design/gateway-erede.md`](docs/design/gateway-erede.md) — contrato com o gateway eRede
- [`docs/design/data-model.md`](docs/design/data-model.md) — entidades, relacionamentos, enums, regras de integridade

---

## TDD — REGRA INVIOLÁVEL

**NUNCA escreva código de produção sem antes ter um teste que falha (RED).**

Ordem obrigatória para qualquer mudança em `src/`:

1. **RED** — escreva o teste; execute e confirme que ele falha pelo motivo correto
2. **GREEN** — escreva o mínimo de código para o teste passar
3. **REFACTOR** — melhore sem quebrar o teste

**Aplica-se a:** features novas, bugfixes, refatorações, qualquer alteração em `src/`.

**NÃO há exceção para:** "código simples", "só um if", "já sei o que fazer", "é óbvio".

Se não existe um teste falhando, não existe código novo.

---

## Documentação externa — sempre a fonte atualizada

**Regra geral:** ao integrar com qualquer SDK/API/framework, **sempre consulte a documentação atualizada online** (Swagger/OpenAPI, portal oficial do dev, docs versionados na web). Nunca dependa de:
- PDFs antigos baixados localmente (mesmo que pareçam recentes — versionamento de PDF é frágil)
- Conhecimento prévio do treino do modelo (corta em datas que podem estar atrás da release atual da API)
- Tutoriais ou repositórios de exemplo que não tenham sido atualizados

**Quando a doc oficial for ambígua, contradizer o código, ou não cobrir o cenário**, valide empiricamente contra o **endpoint sandbox real** (probe com `fetch`/curl) e registre o achado num commit ou no spec correspondente. Sandbox é fonte de verdade superior à doc escrita quando há divergência.

### eRede — doc oficial atual

- **Portal:** https://developer.userede.com.br/e-rede
- **Swagger online (atualizado em mar/2026):** acessar via portal, aba "API Reference" — esse é o **único contrato confiável**
- **NÃO usar** os PDFs de "Integration Manual" (v1.13/v1.16/v1.17/v1.21 etc) como referência primária — são versões antigas, frequentemente desatualizadas em relação ao Swagger online
- **Achados não documentados validados em sandbox** (registrar todos aqui pra evitar redescoberta):
  - Header `Affiliation: {clientId}` é **obrigatório** em todas as chamadas autenticadas (descoberto pelo `returnCode 26`)
  - `POST /token-service/oauth/v2/tokenization` exige `storageCard: 2` no body (multiple-use; valor `0` força `securityCode`, valor `1` retorna "Invalid parameter format")
  - `GET /tokenization/{id}` retorna `brand` como **objeto** `{ name, tokenStatus, brandTid }` — não string. `last4` (não `last4digits`)
  - `billing.birthDate` **não é exigido** pelo gateway v2 — validado em sandbox 2026-05-01 com `returnCode "00"` sem o campo
  - `POST /tokenization/{id}/management` (delete) retorna 403 em sandbox para todos os formatos testados — funcionalidade só validável em produção real
  - **PIX em `POST /v2/transactions`** (validado em sandbox 2026-05-02): `kind: "Pix"` (P maiúsculo, não `"pix"`); campo de expiração é `qrCode: { dateTimeExpiration: "Y-m-d\\TH:i:s" }` SEM timezone nem ms; resposta vem em `qrCodeResponse: { qrCodeData, qrCodeImage, dateTimeExpiration }` — NÃO em `pix: { qrCode, link }`. SDKs oficiais php/node da Rede ainda não suportam PIX; referência confiável é o plugin WP `virtuaria-eredeitau` (open-source) que tem PIX rodando em produção real.

---

## Commands

```bash
npm run dev          # Development server with hot reload (tsx watch)
npm run build        # TypeScript compilation → dist/
npm start            # Run compiled output (dist/src/server.js)
npm run lint         # ESLint on src/
npm run lint:fix     # ESLint with auto-fix
npm run format       # Prettier on src/**/*.ts

npm run test                 # Unit tests (Vitest)
npm run test:integration     # Integration tests (Vitest + banco real)

npm run prisma:generate   # Regenerate Prisma client → generated/prisma/
npm run prisma:migrate    # Run pending migrations (dev)
npm run prisma:seed       # Seed the database
npm run prisma:studio     # Open Prisma Studio UI
```

After any change to `prisma/schema.prisma`, always run `prisma:generate` before running the app.

---

## Environment Setup

Copy `.env.example` to `.env`. Required variables:
- `DATABASE_URL` — MySQL/MariaDB connection string (`mysql://user:pass@host:3306/db`)
- `JWT_SECRET` — signing key for JWT tokens
- `EREDE_PV` — número do estabelecimento eRede
- `EREDE_INTEGRATION_KEY` — chave de integração eRede
- `EREDE_API_URL` — URL base da API eRede
- `EREDE_CALLBACK_SECRET` — secret opcional para validação de callbacks
- `EREDE_PIX_EXPIRATION_HOURS` — horas de expiração do QR Code PIX
- `EREDE_SOFT_DESCRIPTOR` — texto na fatura do cartão
- `EREDE_TIMEOUT_MS` — timeout de requisições ao gateway
- SMTP variables for password reset emails

---

## Deploy (Produção)

**Host:** `72.60.242.92` — `api.tupperwarees.com.br`
**Acesso SSH:** alias `tuppeware-deploy` no `~/.ssh/config` (root + chave `~/.ssh/tuppeware_deploy`, login sem senha já configurado)
**Path no servidor:** `/root/tuppeware_api`
**Process manager:** PM2, app name `tuppeware-api` (script: `yarn start` → `node dist/src/server.js`)
**Banco:** MySQL 8 em container `mysql_tuppeware` no mesmo host
**TLS/proxy:** Traefik via EasyPanel (`api.tupperwarees.com.br`)

**Importante:** o `docker-compose.yml` do repo está obsoleto — produção **não** usa Docker para a API, só PM2 + build local. O Swarm/EasyPanel do host gerencia outros projetos (n8n, postgres, etc.), não a API.

### Procedimento de deploy

```bash
ssh tuppeware-deploy
cd /root/tuppeware_api
git pull --ff-only origin main
# se package.json mudou:
yarn install
# se prisma/schema.prisma mudou:
yarn prisma:generate
yarn prisma:migrate deploy
# build + restart
yarn build
pm2 restart tuppeware-api --update-env
# verificar
pm2 status tuppeware-api
pm2 logs tuppeware-api --lines 30 --nostream
curl -sk https://api.tupperwarees.com.br/health
```

### Diagnóstico
- Logs PM2: `/root/.pm2/logs/tuppeware-api-{out,error}.log`
- `ValidationError ERR_ERL_KEY_GEN_IPV6` no error.log é warning pré-existente do `express-rate-limit` (não impede subir) — deve ser corrigido no `rateLimitMiddleware`

---

## Architecture

### Stack
Node.js + TypeScript, Express 5, Prisma with MariaDB adapter (`@prisma/adapter-mariadb`), Socket.IO for real-time updates.

### Layer pattern
```
Route → Controller → Service → Repository → Prisma (generated/prisma/)
```
Each layer is a class instantiated as a singleton and exported as `default`. All errors propagate via `AppError` and are caught by the centralized `errorHandler` middleware (must remain last in `app.ts`).

**Boundary rules:**
- `req`/`res` must not go below Controller
- Prisma queries must not go above Repository
- No business logic in Controllers

### Prisma client location
Generated to `generated/prisma/` (not `node_modules/@prisma/client`). All Prisma types and enums are re-exported through `src/types/index.ts`. Import types from `../types`, not directly from the generated path.

### API routes (base: `/api`)
| Prefix | File |
|---|---|
| `/auth` | authRoutes.ts |
| `/debts` | debtRoutes.ts |
| `/payments` | paymentRoutes.ts |
| `/payment-history` | paymentHistoryRoutes.ts |
| `/admin` | adminRoutes.ts |
| `/users` | userRoutes.ts |
| `/api/docs` | Swagger UI |
| `/health` | inline health check |

### Authentication & Authorization
- JWT Bearer token via `authMiddleware` — attaches `req.user = { id, role, email, cpf }`
- Role check via `roleMiddleware(...allowedRoles)` — uses `UserRole` enum: `ADMIN`, `GERENTE`, `EMPRESARIA`, `LIDER`, `CONSULTOR`
- User CPF is not in the JWT — services fetch `Consultant` by CPF from `req.user` for hierarchical filtering

### Debt visibility hierarchy
Enforced in `DebtService._buildWhereClause`:
- `ADMIN` / `GERENTE` → all debts
- `EMPRESARIA` → filtered by `distrito` (looks up consultant by CPF)
- `LIDER` → filtered by `grupo` (looks up consultant by CPF)
- `CONSULTOR` → filtered by `codigo` (looks up consultant by CPF)

### Payment flow (eRede gateway — OAuth 2.0 + Cofre v2)
1. `PaymentService.create` validates debts, computes fees, calls `ERedeService.createTransaction`
2. `EredeOAuthClient` gerencia o Bearer token (cache em memória + dedupe inflight + renova 60s antes de expirar)
3. `ERedeService._authedFetchJson` adiciona headers `Authorization: Bearer <token>` + `Affiliation: <eredeClientId>` (descoberta não documentada — header obrigatório) + content-type guard contra resposta não-JSON
4. PIX usa `kind: "pix"` com `expirationDate` (no payload da Rede não há `billing`); cartão usa `kind: "credit"` com card + billing OU com `cardToken` (omitindo `cardNumber`/`cardHolderName`/`expirationMonth`/`expirationYear`)
5. Cofre de Cartões: `tokenizeCardCofre` envia `storageCard: 2` obrigatório (multiple-use, descoberto em sandbox); `queryTokenization` parse `brand` como objeto `{ name, brandTid }`; `manageTokenization` deleta tokens
6. Gateway response codes: `"00"` = PAGO, webhook `status=3` = PENDENTE, `status=4` = CANCELADO
7. Webhook `POST /api/erede/webhook` (sem JWT): idempotência via header `Request-ID` (UNIQUE em `erede_webhook_events`), secret opcional via `X-Erede-Secret` validado em tempo constante (`timingSafeStringCompare`), retry P2002 vira duplicate=true, falha de processamento vira 500 (Rede retenta 12x/30s + 14d)
8. `referenceNum` format: `TPW-{Date.now()}-{userId.slice(0,8)}`
9. Values sent to gateway in **cents** (integer): `Math.round(totalValue * 100)`

### Credit card installment rules
- Total < R$300 → max 1 installment
- R$300–R$499.99 → max 2 installments
- ≥ R$500 → max 3 installments
- 5% fee applied to subtotal; installment validation uses the resulting total

### Real-time updates
`WebSocketService` wraps Socket.IO. Events emitted per user room (`userId`): `payment:created`, `payment:updated`. The server instance is attached in `src/config/websocket.ts`.

### Rate limiting
`rateLimitMiddleware.ts` applies to payment creation routes: 5 requests per 5-minute window (configurable via `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX_REQUESTS`).

### CSV import
Admin routes accept multipart CSV uploads via Multer. `CsvImportService` handles debts; consultant import uses a similar flow. CSV delimiter is `;`.
- Debts format: `codigo;nome;grupo;distrito;semana;valor;data_vencimento;numero_nf;status`
  - `dias_atraso` is calculated automatically from `data_vencimento` (not in CSV)
  - `status`: optional PENDENTE | ATRASADO | PAGO (auto-calculated if omitted)
- Consultants format: `codigo;tipo;grupo;distrito;CPF`

---

## Partial Payments (RF-30/RF-31)

**Status (2026-04-22):** core implementado via plano TDD de 12 tasks. Integration tests **BLOCKED** — DB de testes inacessível (commit `15db847`).

**Fluxo:**
- Rota `POST /payments/partial` (PIX, single-debt) — valida hierarquia, mínimos e se débito permite parcial
- `PaymentService.createPartial` reusa helpers privados extraídos (`_callGatewayPix`, `_persistPayment`, `_handleGatewayError`)
- `DebtRepository.updateDebtPaidAmount` usa lock otimista (compare-and-swap em `paidAmount` + `version`) para evitar race em callbacks concorrentes
- Callback acumula `paidAmount` e dispara webhook **pós-commit** via `WebhookDispatcher`

**Schema:**
- `Debt.paidAmount` (Decimal, default 0) + `version` (Int) para lock
- `Payment.isPartial` (Boolean) — flag distingue parcial de quitação total
- Listagem de débitos retorna `paidAmount` e `remaining` (computed)

**Configuração (5 chaves em `SettingsService.ALLOWED_SETTINGS`):**
- `partial_payment_enabled`, `partial_payment_min_amount`, `partial_payment_min_percentage`
- `partial_webhook_url`, `partial_webhook_secret`

**WebhookDispatcher:** HMAC-SHA256, retry exponencial, `AbortController` timeout. Disparado pós-commit para garantir consistência.

**Docs:** `docs/project/requirements.md` (RF-30/RF-31), Swagger `/api/docs`, plano completo em `docs/plan/partial-payments.md`.

**Pendências:**
- Destravar DB de testes e rodar suite de integration (commit `15db847`)
- Validar webhook end-to-end contra consumidor real

---

## Public Settings em /users/me (2026-04-27)

`GET /api/users/me` agora retorna bloco `settings` com flags públicas (`partialPaymentEnabled`, `partialPaymentMinAmount`, `partialPaymentMinRemaining`) — frontend usa pra decidir UI sem precisar de role GERENTE em `/admin/settings`. Secrets de webhook ficam fora. Implementado em `UserController.getMe` via `Promise.all([userService.findById, settingsService.getAll])` + helper `buildPublicSettings`. Commit `bf6c84d`, deployado.

**Pendências de manutenção descobertas no deploy:**
- `docker-compose.yml` na raiz é obsoleto (prod usa PM2, não Docker) — considerar remover ou marcar como dev-only
- `rateLimitMiddleware` dispara warning `ERR_ERL_KEY_GEN_IPV6` do `express-rate-limit` (não bloqueia, mas precisa do helper `ipKeyGenerator`)
- Senha root SSH do servidor de prod foi exposta em chat — trocar e idealmente desabilitar `PasswordAuthentication` (chave já configurada)
