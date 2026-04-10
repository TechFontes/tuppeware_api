# Tuppeware API - Architecture Document

## Project Overview

Tuppeware is a backend API for managing debts and payments for consultants. Built with Node.js, TypeScript, Express.js, MariaDB, Prisma ORM, JWT authentication, eRede/MaxiPago payment gateway, Socket.IO WebSocket, and Vitest testing.

## Architectural Pattern

Layered (N-Tier) Architecture:
  - Entry Point (src/server.ts)
  - Application Layer (src/app.ts)
  - Route Layer (src/routes/)
  - Controller Layer (src/controllers/)
  - Service Layer (src/services/)
  - Repository Layer (src/repositories/)
  - Database Layer (MariaDB)

## Layer Responsibilities

### Entry Point (src/server.ts)
Responsibilities:
  - Creates HTTP server using Node http module
  - Initializes Express application
  - Sets up WebSocket server (Socket.IO)
  - Configures graceful shutdown (SIGTERM, SIGINT)
  - 10-second force shutdown timeout

### Application Layer (src/app.ts)
Middleware Chain Order:
  1. Helmet (security headers)
  2. CORS (cross-origin requests)
  3. Morgan (HTTP logging)
  4. JSON/URL-encoded parsers
  5. Swagger documentation at /api/docs
  6. Health check endpoint (GET /health)
  7. API routes mounted at /api
  8. Error handler (must be last)

### Route Layer (src/routes/)
Files:
  - index.ts: Main router aggregator
  - authRoutes.ts: /auth (register, login, password reset)
  - debtRoutes.ts: /debts (list, get, user debts)
  - paymentRoutes.ts: /payments (create, list, callback)
  - paymentHistoryRoutes.ts: /payment-history (paginated)
  - adminRoutes.ts: /admin (imports, settings)
  - userRoutes.ts: /users/profile (get, update)

### Controller Layer (src/controllers/)
Files:
  - AuthController: register(), login(), forgotPassword(), resetPassword()
  - UserController: getProfile(), updateProfile()
  - DebtController: getById(), list(), getMyDebts()
  - PaymentController: create(), getById(), list(), handleCallback()
  - PaymentHistoryController: list() with pagination
  - AdminController: importConsultants(), importDebts(), importClients(), settings()

Responsibilities:
  - Extract and validate request data
  - Call service methods
  - Format responses (status, message, data)
  - Delegate errors via next(error)

### Service Layer (src/services/)
Files:
  - AuthService: Authentication, JWT generation
  - UserService: User profile management
  - DebtService: Debt operations and filtering
  - PaymentService: Payment logic, fee calculation
  - ERedeService: Payment gateway integration
  - SavedCardService: Card token management
  - CsvImportService: Bulk data import
  - EmailService: Email notifications
  - SettingsService: System settings
  - WebSocketService: Real-time notifications

Responsibilities:
  - Business logic and validation
  - Orchestrates repository and external service calls
  - Throws AppError for expected failures
  - Ensures data consistency

### Repository Layer (src/repositories/)
Files:
  - UserRepository: create, findById, findByEmail, update, delete
  - ConsultantRepository: Consultant CRUD
  - DebtRepository: Debt CRUD
  - PaymentRepository: Payment CRUD
  - SavedCardRepository: Card token management
  - PasswordResetRepository: Reset token handling
  - SettingsRepository: Settings access

Responsibilities:
  - Encapsulates Prisma database queries
  - Provides clean data interface
  - No business logic

### Middleware Layer (src/middlewares/)
Files:
  - authMiddleware: JWT verification
  - roleMiddleware: Role-based access control
  - rateLimitMiddleware: Rate limiting
  - errorHandler: Error handling
  - validationMiddleware: Validator processor

## Data Flow Examples

### Login Flow
POST /api/auth/login
  → authRoutes → Validators → AuthController.login()
  → AuthService.login()
    - UserRepository.findByEmail(email)
    - Verify password (bcrypt)
    - ConsultantRepository.findByCpf() (link)
    - Generate JWT
  → Response: {user, token, expiresIn}

### Payment Creation
POST /api/payments
  → authMiddleware (verify JWT)
  → roleMiddleware (CONSULTOR+)
  → paymentLinkRateLimiter (5/5min)
  → PaymentController.create()
  → PaymentService.create()
    - DebtRepository.findByIds() (fetch and validate)
    - Calculate fees (5% for credit card)
    - PaymentRepository.create()
    - ERedeService.createTransaction() (gateway)
    - Link debts to payment
    - WebSocketService.emit() (real-time notify)
  → Response: {payment, qrCode or paymentLink}

### CSV Import (Admin Only)
POST /api/admin/import/consultants
  → roleMiddleware(ADMIN)
  → Multer upload
  → AdminController.importConsultants()
  → CsvImportService.importConsultants()
    - Parse CSV
    - Validate each row
    - Check for duplicates
    - Create records
    - Collect errors per line
  → Response: {total, success, errors}

## Key Abstractions

### AppError Class (src/utils/AppError.ts)
Custom error class for operational (expected) errors:
  - statusCode: HTTP status code
  - status: "fail" (4xx) or "error" (5xx)
  - isOperational: true
  - details: optional context

Usage: throw new AppError("Email exists", StatusCodes.CONFLICT);

### Repository Pattern
Encapsulates Prisma database queries:
  - create(data): Promise<T>
  - findById(id): Promise<T|null>
  - update(id, data): Promise<T>
  - findAll(): Promise<T[]>

### Service as Orchestrator
Services coordinate between repositories and external services:
  - Fetch and validate data
  - Apply business logic
  - Persist changes
  - External integrations (eRede, email)
  - Real-time notifications

### Type Safety
Uses Prisma-generated types and custom DTOs:
  - Prisma types (User, Debt, Payment)
  - Custom DTOs (CreatePaymentDTO, RegisterDTO)
  - Enums (UserRole, DebtStatus, PaymentStatus)

### Middleware Composition
Routes combine multiple middlewares:
  POST /api/payments
    → authMiddleware (verify JWT)
    → roleMiddleware (check role)
    → rateLimiter
    → validators
    → validate processor
    → controller handler

## Error Handling

### Error Types Handled
  1. AppError (operational errors)
  2. Prisma errors (P2002 unique, P2025 not found)
  3. Validation errors (express-validator)
  4. JWT errors (invalid, expired)
  5. Multer errors (file size)
  6. Unknown errors (500 server error)

### Error Response Format
{
  "status": "success|fail|error",
  "message": "Description",
  "data": {},
  "errors": []
}

## Security Features

### Authentication (JWT)
  - Token format: Bearer <token> in Authorization header
  - Algorithm: HS256 (HMAC SHA-256)
  - Secret: process.env.JWT_SECRET (required)
  - Expiration: process.env.JWT_EXPIRES_IN (default 7d)
  - Payload: {id, role, email}

### Authorization (RBAC)
  - Roles: ADMIN, GERENTE, EMPRESARIA, LIDER, CONSULTOR
  - Sensitive ops (imports) restricted to ADMIN
  - Payment creation for CONSULTOR+

### Input Validation
  - Email format and uniqueness
  - CPF format validation
  - Password minimum 6 chars
  - Array and numeric constraints

### Rate Limiting
  - Global: 100 requests/IP/15 minutes
  - Payments: 5 requests/user/5 minutes

### Password Security
  - Bcryptjs hashing (salt cost 10)
  - Token-based password reset
  - Single-use tokens with expiration

### Data Protection
  - Soft deletes (isActive flag for users)
  - Card tokens never store card number
  - Database SSL support

## Entry Points

### Startup (src/server.ts)
  - Create HTTP server on PORT (default 3000)
  - Initialize WebSocket
  - Set up graceful shutdown

### Health Check
  - Endpoint: GET /health
  - Response: {status: "ok", timestamp}
  - For: Load balancer checks, monitoring

### Routes (src/routes/index.ts)
  - Mounted at /api in src/app.ts
  - Main aggregator for all subroutes

## Design Principles

  1. Single Responsibility
  2. Dependency Inversion
  3. Fail Fast
  4. Explicit over Implicit
  5. DRY (Do not Repeat Yourself)
  6. Open/Closed (open for extension, closed for modification)
