# Technology Stack

## Project Overview
**Name:** tuppeware  
**Description:** Portal de Gestão de Débitos e Pagamentos - API Backend  
**Type:** Express.js REST API with real-time WebSocket support  
**Version:** 1.0.0  

---

## Languages & Runtime Versions

| Component | Version | Details |
|-----------|---------|---------|
| **Node.js** | 22 (Alpine) | Used in both build and production Docker images |
| **TypeScript** | 5.9.3 | Strict mode enabled |
| **Target JavaScript** | ES2022 | Compiled to CommonJS modules |

---

## Core Frameworks & Major Libraries

### Web Framework
- **Express.js** `5.2.1` — Main HTTP server framework

### Database & ORM
- **Prisma** `7.3.0` — TypeScript ORM with code generation
  - **@prisma/client** `7.3.0` — Runtime client
  - **@prisma/adapter-mariadb** `7.3.0` — MariaDB/MySQL adapter
  - Database: MySQL/MariaDB
  - Schema file: `prisma/schema.prisma`
  - Generated client: `generated/prisma/client`

### Authentication & Security
- **jsonwebtoken** `9.0.3` — JWT token generation and verification
- **bcryptjs** `3.0.3` — Password hashing
- **helmet** `8.1.0` — HTTP security headers
- **cors** `2.8.6` — Cross-Origin Resource Sharing

### Real-time Communication
- **socket.io** `4.8.3` — WebSocket library for real-time events
  - Configuration: `src/config/websocket.ts`
  - Service: `src/services/WebSocketService.ts`

### API Documentation
- **swagger-jsdoc** `6.2.8` — OpenAPI/Swagger spec generation
- **swagger-ui-express** `5.0.1` — Interactive API docs UI at `/api/docs`

### Email & Communication
- **nodemailer** `8.0.1` — SMTP email sending
  - Configuration: `src/services/EmailService.ts`
  - Used for password reset emails

### File Upload & Parsing
- **multer** `2.0.2` — Multipart form data handling (file uploads)
- **csv-parse** `6.1.0` — CSV parsing library
- **fast-xml-parser** `5.4.1` — XML parsing utility

### Middleware & Utilities
- **express-validator** `7.3.1` — Request validation and sanitization
- **express-rate-limit** `8.2.1` — Rate limiting middleware
- **morgan** `1.10.1` — HTTP request logging
- **http-status-codes** `2.3.0` — HTTP status code constants
- **dotenv** `17.2.4` — Environment variable loading
- **tslib** `2.8.1` — TypeScript runtime library

---

## Build Tooling & Compilation

### TypeScript Compilation
- **TypeScript Compiler** `tsc`
  - Config: `tsconfig.json`
  - Target: ES2022, Module: CommonJS
  - Strict mode enabled
  - Path aliases configured:
    - `@config/*` → `src/config/*`
    - `@controllers/*` → `src/controllers/*`
    - `@services/*` → `src/services/*`
    - `@repositories/*` → `src/repositories/*`
    - `@middlewares/*` → `src/middlewares/*`
    - `@utils/*` → `src/utils/*`
    - `@validators/*` → `src/validators/*`
    - `@routes/*` → `src/routes/*`

### Testing
- **Vitest** `4.1.2` — Fast unit test framework
- **@vitest/coverage-v8** `4.1.2` — Code coverage provider
- **supertest** `7.2.2` — HTTP assertion library
- Configurations:
  - Unit tests: `vitest.config.ts`
  - Integration tests: `vitest.integration.config.ts`

### Runtime Development
- **tsx** `4.21.0` — TypeScript execution with hot reload
- **nodemon** `3.1.11` — File watcher for auto-restart

---

## Linting & Code Formatting

### ESLint Configuration
- **eslint** `10.0.0` — JavaScript linting
- **@eslint/js** `10.0.1` — Core ESLint rules
- **typescript-eslint** `8.55.0` — TypeScript-specific rules
- **eslint-config-prettier** `10.1.8` — Prettier integration
- Config file: `eslint.config.mjs` (Flat config format)

### Prettier Configuration
- **prettier** `3.8.1` — Code formatter
- Config file: `.prettierrc`
- Settings: Semicolons, single quotes, 100 char width, 2 space tabs

---

## Configuration Files

### Environment Setup
- `.env` — Local environment variables
- `.env.example` — Template for environment variables
- `.env.test` — Test environment configuration

### Type Definitions
- `src/types/` — TypeScript type definitions
- `generated/prisma/client` — Generated Prisma types

### Node.js Configuration
- `package.json` — Project metadata and dependencies
- `package-lock.json` — Dependency lock file
- `tsconfig.json` — TypeScript compiler configuration
- `nodemon.json` — Auto-reload development configuration

### Docker Configuration
- `Dockerfile` — Multi-stage build (build + production)
- `docker-compose.yml` — Production Docker Compose setup
- `.dockerignore` — Files excluded from Docker build

---

## npm Scripts & Commands

| Script | Command | Purpose |
|--------|---------|---------|
| **dev** | `tsx watch src/server.ts` | Development mode with hot reload |
| **build** | `tsc` | Compile TypeScript to JavaScript |
| **start** | `node dist/src/server.js` | Run compiled production build |
| **lint** | `eslint src/` | Check code for linting issues |
| **lint:fix** | `eslint src/ --fix` | Auto-fix linting issues |
| **format** | `prettier --write "src/**/*.ts"` | Format all TypeScript files |
| **prisma:generate** | `prisma generate` | Generate Prisma Client types |
| **prisma:migrate** | `prisma migrate dev` | Create and run database migrations |
| **prisma:seed** | `prisma db seed` | Populate database with seed data |
| **prisma:studio** | `prisma studio` | Open Prisma visual database editor |
| **test** | `vitest run --config vitest.config.ts` | Run unit tests once |
| **test:watch** | `vitest --config vitest.config.ts` | Run unit tests in watch mode |
| **test:coverage** | `vitest run --config vitest.config.ts --coverage` | Generate coverage report |
| **test:integration** | `vitest run --config vitest.integration.config.ts` | Run integration tests |

---

## Server & Port Configuration

- **Default Port:** 3000
- **Health Check Endpoint:** `GET /health`
- **API Base Path:** `/api`
- **Documentation:** `GET /api/docs` (Swagger UI)
- **WebSocket:** Integrated via Socket.IO on the same port

---

## Development Workflow

1. Install dependencies: `npm install`
2. Set up environment: Copy `.env.example` to `.env`
3. Initialize database: `npx prisma migrate dev`
4. Start development server: `npm run dev`
5. Run tests: `npm test`
6. Build for production: `npm run build`
7. Start production server: `npm start`

---

## Production Deployment

### Docker Build & Run
```bash
docker build -t tuppeware-api .
docker run -d -p 9987:3000 --env-file .env -e NODE_ENV=production --name tuppeware-api tuppeware-api
```

### Docker Compose (Production Stack)
- Uses `docker-compose.yml` with Traefik reverse proxy
- Domain: `api.tupperwarees.com.br`
- HTTPS with Let's Encrypt SSL
- External network: `easypanel`
