# External Integrations & APIs

## Payment Gateway - eRede (Itau/Rede)

eRede is the primary payment gateway for processing both PIX and credit card payments.

**Config Locations:**
- `src/config/erede.ts`
- `src/services/ERedeService.ts`
- `src/controllers/PaymentController.ts`

**Environment Variables:**
EREDE_PV, EREDE_INTEGRATION_KEY, EREDE_API_URL, EREDE_TIMEOUT_MS, EREDE_CALLBACK_SECRET, EREDE_PIX_EXPIRATION_HOURS, EREDE_SOFT_DESCRIPTOR

**Authentication:** HTTP Basic Auth with Base64 credentials
**Endpoints:**
- POST: Create Transaction (PIX or Credit Card)
- GET: Query Transaction Status
- POST: Tokenize Credit Card

**Webhook:** POST /api/payments/callback/erede
- Status Mapping: returnCode "00" = PAGO, status 0 = PAGO, status 3 = PENDENTE, status 4 = CANCELADO

---

## Email Service - Nodemailer SMTP

Sends transactional emails, primarily password reset communications.

**Config:** `src/services/EmailService.ts`
**Environment Variables:** SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
**Email Types:** Password reset emails with 1-hour valid links
**Integration:** Called from `src/services/AuthService.ts`

---

## Real-time Communication - Socket.IO WebSocket

Provides WebSocket connections for real-time event streaming.

**Config:** `src/config/websocket.ts`, `src/services/WebSocketService.ts`
**Events Emitted:**
- `payment:created` - Payment initiated with checkout URL and QR code
- `payment:updated` - Payment status changed via webhook callback
- `auth_error` - Authentication failed on register event

**Authentication:** JWT token verification on 'register' event joins room `user:{userId}`
**Integration Points:** Payment notifications in `src/services/PaymentService.ts`

---

## Database - MariaDB/MySQL with Prisma ORM

Primary data store for users, debts, payments, consultants, saved cards, password resets, settings.

**Config:** `src/config/database.ts`
**Connection Format:** mysql://user:password@localhost:3306/tupperware
**ORM:** Prisma 7.3.0 with @prisma/adapter-mariadb
**Connection Limit:** 5 concurrent connections
**Models:** User, Consultant, Debt, Payment, PaymentDebt, SavedCard, PasswordReset, Setting
**Repositories:** UserRepository, ConsultantRepository, DebtRepository, PaymentRepository, SavedCardRepository, PasswordResetRepository, SettingsRepository

---

## Authentication & Authorization

**JWT Config:** `src/config/auth.ts`
**Environment:** JWT_SECRET (required), JWT_EXPIRES_IN (default 7d)
**Token Generation:** User login/registration via AuthService
**Validation:** authMiddleware.ts on protected routes
**Password Hashing:** bcryptjs 3.0.3
**RBAC:** Roles - ADMIN, GERENTE, EMPRESARIA, LIDER, CONSULTOR (roleMiddleware.ts)

---

## CSV Import Service

Batch imports of consultant, debt, and user data from CSV files.

**Service:** `src/services/CsvImportService.ts`
**Types:**
- Consultant: codigo, tipo, grupo, distrito, cpf
- Debt: codigo, nome, grupo, distrito, semana, valor, data_vencimento, numero_nf
- User: codigo, name, cpf, email, role, grupo, distrito

**API:** POST /api/admin/import/:type (admin only)

---

## Security & Infrastructure

**Rate Limiting:** express-rate-limit (RATE_LIMIT_WINDOW_MS=300000, RATE_LIMIT_MAX_REQUESTS=10)
**Security Headers:** helmet (CSP, X-Frame-Options, X-Content-Type-Options, HSTS)
**CORS:** express-cors with FRONTEND_URL origin
**Request Validation:** express-validator on all routes
**HTTP Logging:** morgan (dev format in development, combined in production)
**Error Handler:** Custom AppError class with statusCode caught by errorHandler middleware
**Frontend:** FRONTEND_URL environment variable for Socket.IO and API access
