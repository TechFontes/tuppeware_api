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

### Payment flow (eRede gateway)
1. `PaymentService.create` validates debts, computes fees, calls `ERedeService.createTransaction`
2. `ERedeService` communicates via JSON POST (REST API); Basic Auth with PV + Integration Key
3. PIX uses `kind: "pix"` with `expirationDate`; credit card uses `kind: "credit"` with card + billing data
4. Gateway response codes: `"00"` = PAGO, webhook `status=3` = PENDENTE, `status=4` = CANCELADO
5. Callback validation checks minimum structure (`tid` present, `returnCode` defined)
6. `referenceNum` format: `TPW-{Date.now()}-{userId.slice(0,8)}`
7. Values sent to gateway in **cents** (integer): `Math.round(totalValue * 100)`

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
