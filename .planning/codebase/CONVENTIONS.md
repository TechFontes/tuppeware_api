# Tuppeware Codebase Conventions

## TypeScript Usage Patterns

### Compiler Settings
Location: tsconfig.json
- Target: ES2022
- Module: CommonJS
- Strict: true
- Declaration Maps: enabled
- Source Maps: enabled

### Type Definitions
Location: /src/types/index.ts
- Re-exports Prisma types from generated/prisma/client
- Exports enums: UserRole, DebtStatus, PaymentMethod, PaymentStatus
- Barrel file for all types

### Type Imports
Use "import type" for type-only imports

## Naming Conventions

### File Organization
- Controllers: PascalCase + Controller -> /src/controllers/
- Services: PascalCase + Service -> /src/services/
- Repositories: PascalCase + Repository -> /src/repositories/
- Middlewares: camelCase + Middleware -> /src/middlewares/
- Routes: camelCase + Routes -> /src/routes/
- Validators: camelCase + Validator -> /src/validators/
- Utilities: camelCase -> /src/utils/

### Naming Style
- Classes: PascalCase
- Methods: camelCase (public), _camelCase (private)
- Variables: camelCase
- Constants: UPPER_SNAKE_CASE
- Unused params: _paramName

### Singleton Pattern
Each service exports single instance as default

## Error Handling

### AppError Class
Location: /src/utils/AppError.ts
- statusCode: HTTP status
- status: fail (4xx) or error (5xx)
- isOperational: true
- details: optional error details

### Error Flow in Controllers
Use try-catch, pass errors to next() middleware

### Centralized Error Handler
Location: /src/middlewares/errorHandler.ts
- Handles AppError, Prisma errors, parse errors
- P2002 -> 409, P2025 -> 404
- Stack trace in development

## Class/Module Patterns

### Singleton Pattern
All services/repositories are singletons

### Repository Pattern
Location: /src/repositories/
- Type-safe Prisma operations
- Relational queries with include
- Soft delete pattern
- Pagination with total count

### Database Singleton
Location: /src/config/database.ts
- PrismaClient with MariaDB adapter
- Connection pooling (limit 5)
- Query logging in development

## Import/Export

### Absolute Path Aliases
tsconfig paths:
@config/* -> src/config/*
@controllers/* -> src/controllers/*
@services/* -> src/services/*
@repositories/* -> src/repositories/*
@middlewares/* -> src/middlewares/*
@utils/* -> src/utils/*
@validators/* -> src/validators/*
@routes/* -> src/routes/*

### Barrel Exports
/src/types/index.ts: All types
/src/routes/index.ts: All routes

## Response Patterns

### Success Response
JSON format:
{
  "status": "success",
  "message": "Portuguese message",
  "data": {}
}

Status codes:
- 200 OK for GET/PUT/PATCH
- 201 Created for POST
- 204 No Content for DELETE

### Pagination Response
Location: /src/utils/pagination.ts
Includes data array and pagination metadata

### Error Response
4xx: { status: "fail", message: "...", details?: [...] }
5xx: { status: "error", message: "..." }

## Authentication/Authorization

### JWT Configuration
Location: /src/config/auth.ts
- Secret from JWT_SECRET env
- Fallback: default-secret-change-me
- Expiration: 7d default

### Auth Middleware
Location: /src/middlewares/authMiddleware.ts
- Validates: Authorization: Bearer <token>
- Sets: req.user
- Throws AppError 401 for invalid tokens

### Role Authorization
Location: /src/middlewares/roleMiddleware.ts
Validates req.user.role against allowed roles

### Available Roles
- ADMIN: Full access
- GERENTE: Management
- EMPRESARIA: Business owner
- LIDER: Team leader
- CONSULTOR: Regular consultant

### Password Security
- bcryptjs hashing (10 rounds)
- Passwords excluded from responses
- Soft deletion with isActive flag

## Code Style

### Prettier Rules
- Semicolons: always
- Quotes: single
- Trailing commas: all
- Print width: 100
- Tab width: 2
- Arrow parens: always

### ESLint Rules
- indent: 2 spaces (Error)
- quotes: single (Error)
- semi: always (Error)
- no-unused-vars: warn with _ exception
- no-console: warn (allow info/warn/error)
- no-var: error
- prefer-const: error
- eqeqeq: always (Error)
- curly: always (Error)
- no-throw-literal: error
- no-duplicate-imports: error

## Validation

### Express-Validator
Location: /src/validators/authValidator.ts
Declarative validation chains

### Validation Middleware
Location: /src/validators/validationMiddleware.ts
Checks validationResult and returns 400 on failure

Route pattern:
router.post(path, validators, validate, handler);

## Logging

### Console Usage
- Allowed: console.info(), console.warn(), console.error()
- Disallowed: console.log()

### Morgan HTTP Logging
- Development: dev format
- Production: combined format

### Prisma Logging
- Development: query, info, warn, error
- Production: error only

## Security

### Helmet
Sets security headers

### CORS
Default: allow all origins

### Rate Limiting
Location: /src/middlewares/rateLimitMiddleware.ts
- Window: 15 minutes
- Limit: 100 per IP

### Environment Variables
- JWT_SECRET: signing key
- DATABASE_URL: connection
- NODE_ENV: environment

## Testing

### Unit Tests
Config: vitest.config.ts
Includes: src/__tests__/unit/**/*.test.ts
Environment: node, globals: true

### Integration Tests
Config: vitest.integration.config.ts
Includes: src/__tests__/integration/**/*.test.ts
Timeout: 30 seconds

### Test Helpers
Location: /src/__tests__/helpers/
- factories.ts: createUser, createDebt, cleanDatabase
- testClient.ts: Supertest client, authHeader helper

### Mocking
- vi.mock() for modules
- vi.fn() for functions
- Unit tests use mocks
- Integration tests use real DB

---

Summary: Strict TypeScript, PascalCase classes, camelCase functions, singleton services, centralized AppError, standardized responses, JWT+RBAC, 100-char formatting, 2 spaces, single quotes, semicolons, express-validator validation, Morgan logging, Helmet headers, comprehensive error handling.
