# STRUCTURE.md — Directory Layout & Organization

## Root Structure

```
tuppeware/
├── src/                    # Source TypeScript code
├── prisma/                 # Database schema & migrations
├── docs/                   # Project documentation
│   ├── design/             # Architecture, data model, gateway contracts
│   └── project/            # Scope, requirements, acceptance criteria
├── generated/              # Prisma-generated client (gitignored-ish)
├── dist/                   # Compiled output (gitignored)
├── .planning/              # GSD planning artifacts
├── .claude/                # Claude Code skills
├── coverage/               # Test coverage reports
├── Dockerfile              # Multi-stage Docker build
├── docker-compose.yml      # Dev/prod compose config
├── package.json            # Dependencies & scripts
├── tsconfig.json           # TypeScript config
├── vitest.config.ts        # Unit test config
├── vitest.integration.config.ts  # Integration test config
├── .env                    # Environment variables (not committed)
└── CLAUDE.md               # Claude Code instructions
```

## src/ Structure

```
src/
├── server.ts               # Entry point — HTTP server startup
├── app.ts                  # Express app setup, middleware registration
│
├── config/
│   ├── auth.ts             # JWT secret export
│   ├── database.ts         # Prisma client singleton
│   ├── erede.ts            # eRede gateway config from env
│   ├── swagger.ts          # Swagger/OpenAPI setup
│   └── websocket.ts        # Socket.IO server attachment
│
├── controllers/
│   ├── AdminController.ts        # Admin: users, consultants, CSV import
│   ├── AuthController.ts         # Login, register, password reset
│   ├── DebtController.ts         # Debt listing and filtering
│   ├── PaymentController.ts      # Payment creation, callback, history
│   ├── PaymentHistoryController.ts  # Payment history listing
│   └── UserController.ts         # User profile, saved cards
│
├── middlewares/
│   ├── authMiddleware.ts         # JWT verification → req.user
│   ├── errorHandler.ts           # Centralized error handler (last middleware)
│   ├── rateLimitMiddleware.ts    # Rate limiting for payment routes
│   └── roleMiddleware.ts         # Role-based access control
│
├── repositories/
│   ├── ConsultantRepository.ts   # Consultant DB queries
│   ├── DebtRepository.ts         # Debt DB queries
│   ├── PasswordResetRepository.ts  # Password reset token queries
│   ├── PaymentRepository.ts      # Payment DB queries
│   ├── SavedCardRepository.ts    # Saved card DB queries
│   ├── SettingsRepository.ts     # App settings queries
│   └── UserRepository.ts         # User DB queries
│
├── routes/
│   ├── index.ts                  # Route aggregator
│   ├── adminRoutes.ts            # /api/admin/*
│   ├── authRoutes.ts             # /api/auth/*
│   ├── debtRoutes.ts             # /api/debts/*
│   ├── paymentHistoryRoutes.ts   # /api/payment-history/*
│   ├── paymentRoutes.ts          # /api/payments/*
│   └── userRoutes.ts             # /api/users/*
│
├── services/
│   ├── AuthService.ts            # Authentication, registration, password reset
│   ├── CsvImportService.ts       # CSV batch import (debts, consultants, users)
│   ├── DebtService.ts            # Debt listing with visibility hierarchy
│   ├── EmailService.ts           # SMTP email (Nodemailer)
│   ├── ERedeService.ts           # eRede gateway HTTP client
│   ├── PaymentService.ts         # Payment orchestration, fee calculation
│   ├── SavedCardService.ts       # Saved card management (cardToken)
│   ├── SettingsService.ts        # App settings CRUD
│   ├── UserService.ts            # User profile management
│   └── WebSocketService.ts       # Socket.IO real-time events
│
├── types/
│   ├── index.ts                  # Re-exports all Prisma types/enums
│   └── express.d.ts              # Express Request augmentation (req.user)
│
├── utils/
│   ├── AppError.ts               # Custom error class (message + statusCode)
│   ├── constants.ts              # Shared constants (TIPO_TO_ROLE, etc.)
│   ├── cpfValidator.ts           # CPF format/digit validation
│   ├── csvParser.ts              # CSV parsing utilities
│   └── pagination.ts             # Pagination helpers
│
├── validators/
│   ├── adminValidator.ts         # Admin route validators
│   ├── authValidator.ts          # Auth route validators
│   ├── paymentValidator.ts       # Payment validators (card, PIX, installments)
│   ├── savedCardValidator.ts     # Saved card validators
│   ├── userValidator.ts          # User route validators
│   └── validationMiddleware.ts   # express-validator error handling middleware
│
└── __tests__/
    ├── helpers/
    │   ├── factories.ts           # Test factories (createUser, createDebt, etc.)
    │   └── testClient.ts          # Supertest HTTP client helper
    ├── unit/
    │   ├── config/                # Config unit tests
    │   ├── controllers/           # Controller unit tests
    │   ├── middlewares/           # Middleware unit tests
    │   ├── services/              # Service unit tests
    │   ├── utils/                 # Util unit tests
    │   └── validators/            # Validator unit tests
    └── integration/
        ├── admin.test.ts          # Admin endpoints integration tests
        ├── auth.test.ts           # Auth endpoints integration tests
        ├── debts.test.ts          # Debt endpoints integration tests
        └── payments.test.ts       # Payment endpoints integration tests
```

## prisma/ Structure

```
prisma/
├── schema.prisma              # Data models, relations, enums
└── migrations/                # Auto-generated migration files
    └── YYYYMMDD_HHMMSS_*/
```

## Key File Locations

| Purpose | File |
|---|---|
| App entry point | `src/server.ts` |
| Express app config | `src/app.ts` |
| Prisma singleton | `src/config/database.ts` |
| All Prisma types | `src/types/index.ts` |
| Custom error class | `src/utils/AppError.ts` |
| Shared constants | `src/utils/constants.ts` |
| Error handler | `src/middlewares/errorHandler.ts` |
| Route registration | `src/routes/index.ts` |
| Data models | `prisma/schema.prisma` |

## Naming Conventions

| Item | Convention | Example |
|---|---|---|
| Files (classes) | PascalCase | `PaymentService.ts` |
| Files (config/utils) | camelCase | `database.ts`, `cpfValidator.ts` |
| Classes | PascalCase | `class PaymentService` |
| Instances/exports | camelCase | `export default paymentService` |
| Interfaces | PascalCase | `interface CreatePaymentDto` |
| Enums | UPPER_CASE values | `UserRole.ADMIN` |
| Test files | `*.test.ts` | `PaymentService.test.ts` |
| Routes prefix | `/api/<resource>` | `/api/payments` |

## Module Export Pattern

All services, repositories, and controllers are singletons exported as `default`:

```typescript
class PaymentService { ... }
export default new PaymentService();
```

## Test Organization

- Unit tests mirror `src/` structure under `src/__tests__/unit/`
- Integration tests are flat under `src/__tests__/integration/`
- Helpers shared across all tests in `src/__tests__/helpers/`
- Separate Vitest configs: `vitest.config.ts` (unit) and `vitest.integration.config.ts` (integration)
