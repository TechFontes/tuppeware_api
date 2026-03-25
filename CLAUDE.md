# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Development server with hot reload (tsx watch)
npm run build        # TypeScript compilation → dist/
npm start            # Run compiled output (dist/src/server.js)
npm run lint         # ESLint on src/
npm run lint:fix     # ESLint with auto-fix
npm run format       # Prettier on src/**/*.ts

npm run prisma:generate   # Regenerate Prisma client → generated/prisma/
npm run prisma:migrate    # Run pending migrations (dev)
npm run prisma:seed       # Seed the database
npm run prisma:studio     # Open Prisma Studio UI
```

After any change to `prisma/schema.prisma`, always run `prisma:generate` before running the app.

## Environment Setup

Copy `.env.example` to `.env`. Required variables:
- `DATABASE_URL` — MySQL/MariaDB connection string (`mysql://user:pass@host:3306/db`)
- `JWT_SECRET` — signing key for JWT tokens
- `MAXIPAGO_MERCHANT_ID` / `MAXIPAGO_MERCHANT_KEY` — gateway credentials
- `MAXIPAGO_CALLBACK_SECRET` — HMAC secret for webhook signature validation
- SMTP variables for password reset emails

## Architecture

### Stack
Node.js + TypeScript, Express 5, Prisma with MariaDB adapter (`@prisma/adapter-mariadb`), Socket.IO for real-time updates.

### Layer pattern
```
Route → Controller → Service → Repository → Prisma (generated/prisma/)
```
Each layer is a class instantiated as a singleton and exported as `default`. All errors propagate via `AppError` and are caught by the centralized `errorHandler` middleware (must remain last in `app.ts`).

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
| `/api/docs` | Swagger UI |
| `/health` | inline health check |

### Authentication & Authorization
- JWT Bearer token via `authMiddleware` — attaches `req.user = { id, role, email }`
- Role check via `roleMiddleware(...allowedRoles)` — uses `UserRole` enum: `ADMIN`, `EMPRESARIA`, `LIDER`, `CONSULTOR`
- User CPF is not in the JWT — `DebtService` fetches `Consultant` by CPF from `req.user` for hierarchical filtering

### Debt visibility hierarchy
Enforced in `DebtService._buildWhereClause`:
- `ADMIN` → all debts
- `EMPRESARIA` → filtered by `distrito` (looks up consultant by CPF)
- `LIDER` → filtered by `grupo` (looks up consultant by CPF)
- `CONSULTOR` → filtered by `codigo` (looks up consultant by CPF)

### Payment flow (MaxiPago gateway)
1. `PaymentService.create` validates debts, computes fees, calls `MaxiPagoService.createTransaction`
2. `MaxiPagoService` communicates via XML POST (using `fast-xml-parser`); uses `escapeXml` for all user-provided values in XML
3. PIX uses `eWallet` block with `type=redepay`; credit card uses `creditCard` block
4. Gateway response codes: `"0"` = PAGO, `"5"` or `"6"` = PENDENTE, anything else = CANCELADO
5. Webhook callback verified by HMAC-SHA256 on sorted canonical query string via `validateCallbackSignature`
6. `referenceNum` format: `TPW-{Date.now()}-{userId.slice(0,8)}`

### Credit card installment rules
- Subtotal < R$300 → max 1 installment
- R$300–R$499.99 → max 2 installments
- ≥ R$500 → max 3 installments
- 5% fee applied before installment validation

### Real-time updates
`WebSocketService` wraps Socket.IO. Events emitted per user room (`userId`): `payment:created`, `payment:updated`. The server instance is attached in `src/config/websocket.ts`.

### Rate limiting
`rateLimitMiddleware.ts` applies to payment creation routes: 5 requests per 5-minute window (configurable via `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX_REQUESTS`).

### CSV import
Admin routes accept multipart CSV uploads via Multer. `CsvImportService` handles debts; consultant import uses a similar flow. CSV delimiter is `;`.
- Debts format: `codigo;nome;grupo;distrito;semana;valor;dias_atraso;data_vencimento;numero_nf`
- Consultants format: `codigo;tipo;grupo;distrito;CPF`
