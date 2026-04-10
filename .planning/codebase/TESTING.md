# Tuppeware Testing Patterns and Guidelines

## Test Framework and Configuration

### Vitest Setup
The project uses Vitest as the testing framework.

#### Unit Test Configuration
File: vitest.config.ts
- Globals: true (no import needed)
- Environment: node
- Include: src/__tests__/unit/**/*.test.ts
- Coverage Provider: v8
- Coverage Reporters: text, lcov

#### Integration Test Configuration
File: vitest.integration.config.ts
- Include: src/__tests__/integration/**/*.test.ts
- Timeout: 30 seconds
- Pool: forks (isolated)
- Single Fork: true (sequential)
- NODE_ENV: test

### Running Tests
npm test - unit tests
npm run test:watch - watch mode
npm run test:coverage - with coverage
npm run test:integration - integration tests

## Test Types and Structure

### Unit Tests
Location: /src/__tests__/unit/{domain}/{FileName}.test.ts
Characteristics:
- Mocked dependencies
- No database access
- Fast execution
- Focused testing

### Integration Tests
Location: /src/__tests__/integration/{domain}.test.ts
Characteristics:
- Real database access
- Real HTTP requests via Supertest
- End-to-end testing
- Database cleanup between tests

## Test File Naming

Pattern: {Subject}.test.ts or {Subject}.{Variant}.test.ts

Examples:
- authMiddleware.test.ts
- AuthController.test.ts
- AuthService.test.ts
- DebtService.admin.test.ts

## Test Structure

Using Vitest globals: describe, it, expect, beforeEach, vi

Test names: 'should [verb] [when condition]'
Good: 'should return 200 when credentials valid'
Bad: 'test login'

## Mocking Patterns

vi.mock() at top of file before imports
vi.mocked() to access mock functions
vi.fn() for function stubs
vi.clearAllMocks() in beforeEach

## Test Helpers

Location: /src/__tests__/helpers/

### factories.ts
- createUser(overrides)
- createDebt(overrides)
- createConsultant(userId, overrides)
- cleanDatabase()

### testClient.ts
- api: Supertest client
- authHeader(userId, role, email): Generate JWT

## Unit Test Examples

### Middleware Tests
File: /src/__tests__/unit/middlewares/authMiddleware.test.ts
Tests: JWT validation, error cases, token format

### Service Tests
File: /src/__tests__/unit/services/AuthService.test.ts
Mocks: repositories, external services

### Controller Tests
File: /src/__tests__/unit/controllers/UserController.test.ts
Tests: request handling, response format, error propagation

## Integration Test Examples

### API Tests
File: /src/__tests__/integration/auth.test.ts
Tests: POST /api/auth/login with real DB
Setup: cleanDatabase in beforeEach/afterEach

## Coverage Configuration

Provider: v8
Include: src/**/*.ts
Exclude: tests, types, server.ts

Coverage Goals:
- Services: 80%+
- Repositories: 70%+
- Controllers: 75%+
- Middlewares: 85%+
- Utils: 85%+

## Common Test Patterns

### Success and Error Paths
Test both happy path and error scenarios
Use expect().toThrow() for errors
Use await expect().rejects for async errors

### Response Format Testing
Validate JSON structure
Check HTTP status codes
Ensure sensitive data excluded

## Good Test Examples in Codebase

### authMiddleware.test.ts
- Helper functions (makeReq, makeRes, makeNext)
- Edge case coverage
- Clear test names

### auth.test.ts (integration)
- Database setup/cleanup
- Supertest usage
- beforeEach isolation

### UserController.test.ts
- Service mocking
- Response validation
- Sensitive data checks

---

Summary: Vitest with node environment, unit tests use mocks, integration tests use real DB, factories for test data, Supertest for HTTP, clear naming (should...), proper setup/teardown.
