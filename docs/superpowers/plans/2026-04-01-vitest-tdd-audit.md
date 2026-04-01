# Tuppeware — Vitest + TDD + Auditoria Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Configurar Vitest, cobrir o projeto com unit tests (business logic + gateway) e integration tests (endpoints HTTP), e auditar o código atual contra os requisitos documentados.

**Architecture:** Vitest com duas configs separadas — `vitest.config.ts` para unit tests (rápidos, sem banco) e `vitest.integration.config.ts` para integration tests (banco MariaDB real). Unit tests mocam todos os repositórios e serviços externos via `vi.mock`. Integration tests usam `supertest` contra a app Express real com banco de teste isolado.

**Tech Stack:** Vitest, @vitest/coverage-v8, supertest, @types/supertest, TypeScript, Express 5, Prisma, MariaDB.

---

## ⚠️ REGRA TDD — INVIOLÁVEL

**Para cada task de teste:** escreva o teste PRIMEIRO, confirme que falha (RED), depois implemente o mínimo para passar (GREEN). Nunca inverta a ordem.

---

## Paralelização

```
Task 1 (Setup) → obrigatório primeiro
    ↓ (paralelo)
Task 2A (utils)   Task 2B (ERedeService)   Task 2C (AuthService)   Task 2D (DebtService)   Task 2E (PaymentService)
    ↓ (todos 2A-2E concluídos)
Task 3 (Integration tests)
    ↓
Task 4 (Auditoria)
```

**Tasks 2A–2E podem ser executadas em paralelo por agentes independentes.** Cada uma é auto-contida.

---

## File Map

| Ação | Arquivo |
|---|---|
| Criar | `vitest.config.ts` |
| Criar | `vitest.integration.config.ts` |
| Criar | `src/__tests__/unit/utils/pagination.test.ts` |
| Criar | `src/__tests__/unit/utils/cpfValidator.test.ts` |
| Criar | `src/__tests__/unit/services/ERedeService.test.ts` |
| Criar | `src/__tests__/unit/services/AuthService.test.ts` |
| Criar | `src/__tests__/unit/services/DebtService.test.ts` |
| Criar | `src/__tests__/unit/services/PaymentService.test.ts` |
| Criar | `src/__tests__/helpers/factories.ts` |
| Criar | `src/__tests__/helpers/testClient.ts` |
| Criar | `src/__tests__/integration/auth.test.ts` |
| Criar | `src/__tests__/integration/debts.test.ts` |
| Criar | `src/__tests__/integration/payments.test.ts` |
| Modificar | `package.json` — adicionar scripts e devDependencies |

---

## Task 1: Setup do Vitest (OBRIGATÓRIA — executar primeiro)

**Files:**
- Criar: `vitest.config.ts`
- Criar: `vitest.integration.config.ts`
- Modificar: `package.json`

- [ ] **Step 1.1: Instalar dependências**

```bash
npm install -D vitest @vitest/coverage-v8 supertest @types/supertest
```

Resultado esperado: nenhum erro, packages adicionados ao `package.json`.

- [ ] **Step 1.2: Criar `vitest.config.ts`**

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/__tests__/unit/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/__tests__/**', 'src/types/**', 'src/server.ts'],
    },
  },
});
```

- [ ] **Step 1.3: Criar `vitest.integration.config.ts`**

```typescript
// vitest.integration.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/__tests__/integration/**/*.test.ts'],
    timeout: 30000,
    hookTimeout: 30000,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    env: {
      NODE_ENV: 'test',
    },
  },
});
```

- [ ] **Step 1.4: Adicionar scripts no `package.json`**

No objeto `"scripts"`, adicionar:

```json
"test": "vitest run --config vitest.config.ts",
"test:watch": "vitest --config vitest.config.ts",
"test:coverage": "vitest run --config vitest.config.ts --coverage",
"test:integration": "vitest run --config vitest.integration.config.ts"
```

- [ ] **Step 1.5: Criar estrutura de diretórios**

```bash
mkdir -p src/__tests__/unit/utils src/__tests__/unit/services src/__tests__/integration src/__tests__/helpers
```

- [ ] **Step 1.6: Criar arquivo canário para validar setup**

Criar `src/__tests__/unit/utils/sanity.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';

describe('sanity', () => {
  it('vitest está funcionando', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 1.7: Rodar e confirmar que o canário passa**

```bash
npm test
```

Resultado esperado:
```
✓ src/__tests__/unit/utils/sanity.test.ts (1)
  ✓ sanity > vitest está funcionando
Test Files  1 passed (1)
```

- [ ] **Step 1.8: Remover arquivo canário**

```bash
rm src/__tests__/unit/utils/sanity.test.ts
```

- [ ] **Step 1.9: Commit do setup**

```bash
git add vitest.config.ts vitest.integration.config.ts package.json package-lock.json src/__tests__/
git commit -m "chore: configura Vitest para unit e integration tests"
```

---

## Task 2A: Unit tests — utils/pagination e utils/cpfValidator

**Files:**
- Criar: `src/__tests__/unit/utils/pagination.test.ts`
- Criar: `src/__tests__/unit/utils/cpfValidator.test.ts`

**Pré-requisito:** Task 1 concluída.

- [ ] **Step 2A.1: Escrever testes de pagination (RED)**

Criar `src/__tests__/unit/utils/pagination.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { getPaginationParams, paginatedResponse } from '../../../utils/pagination';

describe('getPaginationParams', () => {
  it('retorna defaults quando query está vazia', () => {
    const result = getPaginationParams({});
    expect(result).toEqual({ page: 1, limit: 10, skip: 0 });
  });

  it('parseia page e limit válidos', () => {
    const result = getPaginationParams({ page: '3', limit: '20' });
    expect(result).toEqual({ page: 3, limit: 20, skip: 40 });
  });

  it('clipa page ao mínimo 1', () => {
    expect(getPaginationParams({ page: '0' }).page).toBe(1);
    expect(getPaginationParams({ page: '-5' }).page).toBe(1);
  });

  it('clipa limit ao máximo 100', () => {
    expect(getPaginationParams({ limit: '999' }).limit).toBe(100);
  });

  it('clipa limit ao mínimo 1', () => {
    expect(getPaginationParams({ limit: '0' }).limit).toBe(1);
  });

  it('calcula skip corretamente', () => {
    expect(getPaginationParams({ page: '5', limit: '15' }).skip).toBe(60);
  });

  it('trata valores não-numéricos como defaults', () => {
    const result = getPaginationParams({ page: 'abc', limit: 'xyz' });
    expect(result).toEqual({ page: 1, limit: 10, skip: 0 });
  });
});

describe('paginatedResponse', () => {
  it('retorna estrutura correta com metadados de paginação', () => {
    const data = [{ id: '1' }];
    const result = paginatedResponse(data, 25, 2, 10);
    expect(result).toEqual({
      data,
      pagination: {
        total: 25,
        page: 2,
        limit: 10,
        totalPages: 3,
        hasNextPage: true,
        hasPreviousPage: true,
      },
    });
  });

  it('hasNextPage é false na última página', () => {
    const result = paginatedResponse([], 10, 1, 10);
    expect(result.pagination.hasNextPage).toBe(false);
  });

  it('hasPreviousPage é false na primeira página', () => {
    const result = paginatedResponse([], 10, 1, 10);
    expect(result.pagination.hasPreviousPage).toBe(false);
  });

  it('totalPages arredonda para cima', () => {
    const result = paginatedResponse([], 11, 1, 10);
    expect(result.pagination.totalPages).toBe(2);
  });

  it('funciona com array vazio e total zero', () => {
    const result = paginatedResponse([], 0, 1, 10);
    expect(result.pagination.totalPages).toBe(0);
    expect(result.pagination.hasNextPage).toBe(false);
  });
});
```

- [ ] **Step 2A.2: Rodar e confirmar RED**

```bash
npm test -- --reporter=verbose src/__tests__/unit/utils/pagination.test.ts
```

Resultado esperado: PASS (estes são testes de funções puras já implementadas — o RED aqui é garantido pelo setup; se falhar, investigar o import).

- [ ] **Step 2A.3: Escrever testes de cpfValidator (RED)**

Criar `src/__tests__/unit/utils/cpfValidator.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { isValidCPF, cleanCPF, formatCPF } from '../../../utils/cpfValidator';

describe('isValidCPF', () => {
  it('retorna true para CPF válido sem formatação', () => {
    expect(isValidCPF('11144477735')).toBe(true);
  });

  it('retorna true para CPF válido com formatação', () => {
    expect(isValidCPF('111.444.777-35')).toBe(true);
  });

  it('retorna false para todos os dígitos iguais', () => {
    expect(isValidCPF('11111111111')).toBe(false);
    expect(isValidCPF('00000000000')).toBe(false);
  });

  it('retorna false para CPF com comprimento incorreto', () => {
    expect(isValidCPF('1234567890')).toBe(false);
    expect(isValidCPF('123456789012')).toBe(false);
  });

  it('retorna false para primeiro dígito verificador errado', () => {
    expect(isValidCPF('11144477736')).toBe(false);
  });

  it('retorna false para segundo dígito verificador errado', () => {
    expect(isValidCPF('11144477734')).toBe(false);
  });

  it('retorna false para string vazia', () => {
    expect(isValidCPF('')).toBe(false);
  });
});

describe('cleanCPF', () => {
  it('remove pontos e hífen', () => {
    expect(cleanCPF('111.444.777-35')).toBe('11144477735');
  });

  it('retorna dígitos sem alteração', () => {
    expect(cleanCPF('11144477735')).toBe('11144477735');
  });

  it('remove espaços e outros caracteres', () => {
    expect(cleanCPF('111 444 777 35')).toBe('11144477735');
  });
});

describe('formatCPF', () => {
  it('formata CPF limpo no padrão XXX.XXX.XXX-XX', () => {
    expect(formatCPF('11144477735')).toBe('111.444.777-35');
  });

  it('re-formata CPF já formatado', () => {
    expect(formatCPF('111.444.777-35')).toBe('111.444.777-35');
  });
});
```

- [ ] **Step 2A.4: Rodar todos os unit tests de utils**

```bash
npm test -- src/__tests__/unit/utils/
```

Resultado esperado: todos PASS.

- [ ] **Step 2A.5: Commit**

```bash
git add src/__tests__/unit/utils/
git commit -m "test: unit tests para pagination e cpfValidator"
```

---

## Task 2B: Unit tests — ERedeService

**Files:**
- Criar: `src/__tests__/unit/services/ERedeService.test.ts`

**Pré-requisito:** Task 1 concluída.

- [ ] **Step 2B.1: Escrever testes (RED)**

Criar `src/__tests__/unit/services/ERedeService.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import AppError from '../../../utils/AppError';

// Configura variáveis de ambiente antes de importar o service
beforeEach(() => {
  process.env.EREDE_PV = 'test-pv';
  process.env.EREDE_INTEGRATION_KEY = 'test-key';
  process.env.EREDE_PIX_EXPIRATION_HOURS = '24';
  process.env.EREDE_SOFT_DESCRIPTOR = 'TUPPEWARE-TEST';
});

// Importação depois do beforeEach para pegar as env vars
const getService = async () => {
  vi.resetModules();
  const mod = await import('../../../services/ERedeService');
  return mod.default;
};

describe('ERedeService.buildPixPayload', () => {
  it('retorna payload com kind=pix e campos corretos', async () => {
    const svc = await getService();
    const payload = svc.buildPixPayload('TPW-123-abcd1234', 15000);

    expect(payload.kind).toBe('pix');
    expect(payload.reference).toBe('TPW-123-abcd1234');
    expect(payload.amount).toBe(15000);
    expect(payload.expirationDate).toBeDefined();
  });

  it('data de expiração está no futuro', async () => {
    const svc = await getService();
    const before = Date.now();
    const payload = svc.buildPixPayload('TPW-1', 1000);
    const expiration = new Date(payload.expirationDate).getTime();
    expect(expiration).toBeGreaterThan(before);
  });
});

describe('ERedeService.buildCreditPayload', () => {
  const baseParams = {
    reference: 'TPW-123-abcd1234',
    amountCents: 52500,
    installments: 2,
    card: {
      number: '4111111111111111',
      expMonth: '12',
      expYear: '2028',
      cvv: '123',
      holderName: 'JOAO DA SILVA',
    },
    billing: {
      name: 'Joao da Silva',
      document: '111.444.777-35',
      email: 'joao@email.com',
      address: 'Rua Exemplo',
      district: 'Centro',
      city: 'São Paulo',
      state: 'SP',
      postalcode: '01310100',
    },
  };

  it('retorna kind=credit', async () => {
    const svc = await getService();
    const payload = svc.buildCreditPayload(baseParams);
    expect(payload.kind).toBe('credit');
  });

  it('remove caracteres não-numéricos do documento', async () => {
    const svc = await getService();
    const payload = svc.buildCreditPayload(baseParams) as any;
    expect(payload.billing.document).toBe('11144477735');
  });

  it('converte país default (ausente) para BRA', async () => {
    const svc = await getService();
    const payload = svc.buildCreditPayload(baseParams) as any;
    expect(payload.billing.address.country).toBe('BRA');
  });

  it('converte BR para BRA', async () => {
    const svc = await getService();
    const payload = svc.buildCreditPayload({ ...baseParams, billing: { ...baseParams.billing, country: 'BR' } }) as any;
    expect(payload.billing.address.country).toBe('BRA');
  });

  it('converte US para USA', async () => {
    const svc = await getService();
    const payload = svc.buildCreditPayload({ ...baseParams, billing: { ...baseParams.billing, country: 'US' } }) as any;
    expect(payload.billing.address.country).toBe('USA');
  });

  it('usa capture=true', async () => {
    const svc = await getService();
    const payload = svc.buildCreditPayload(baseParams) as any;
    expect(payload.capture).toBe(true);
  });
});

describe('ERedeService.mapStatusToLocal', () => {
  it('returnCode "00" → PAGO', async () => {
    const svc = await getService();
    expect(svc.mapStatusToLocal('00')).toBe('PAGO');
  });

  it('webhookStatus 0 → PAGO', async () => {
    const svc = await getService();
    expect(svc.mapStatusToLocal('XX', 0)).toBe('PAGO');
  });

  it('webhookStatus 3 → PENDENTE', async () => {
    const svc = await getService();
    expect(svc.mapStatusToLocal('XX', 3)).toBe('PENDENTE');
  });

  it('webhookStatus 4 → CANCELADO', async () => {
    const svc = await getService();
    expect(svc.mapStatusToLocal('XX', 4)).toBe('CANCELADO');
  });

  it('returnCode desconhecido sem webhookStatus → CANCELADO', async () => {
    const svc = await getService();
    expect(svc.mapStatusToLocal('99')).toBe('CANCELADO');
  });

  it('returnCode "00" tem precedência sobre webhookStatus', async () => {
    const svc = await getService();
    expect(svc.mapStatusToLocal('00', 3)).toBe('PAGO');
  });
});

describe('ERedeService.validateCallbackSignature', () => {
  it('retorna true para payload válido', async () => {
    const svc = await getService();
    expect(svc.validateCallbackSignature({
      tid: 'abc123',
      returnCode: '00',
      status: 0,
      reference: 'TPW-1',
      amount: 1000,
    })).toBe(true);
  });

  it('retorna false quando tid está vazio', async () => {
    const svc = await getService();
    expect(svc.validateCallbackSignature({
      tid: '',
      returnCode: '00',
      status: 0,
      reference: 'TPW-1',
      amount: 1000,
    })).toBe(false);
  });

  it('retorna false quando returnCode é undefined', async () => {
    const svc = await getService();
    expect(svc.validateCallbackSignature({
      tid: 'abc',
      returnCode: undefined as any,
      status: 0,
      reference: 'TPW-1',
      amount: 1000,
    })).toBe(false);
  });

  it('retorna false para payload null', async () => {
    const svc = await getService();
    expect(svc.validateCallbackSignature(null as any)).toBe(false);
  });
});

describe('ERedeService.createTransaction', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('retorna resposta parseada em caso de sucesso PIX', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        tid: 'tid-123',
        returnCode: '00',
        returnMessage: 'Aprovado',
        reference: 'TPW-1',
        pix: {
          qrCode: '00020126...',
          link: 'https://pix.link/qr',
          expirationDate: '2026-04-02T10:00:00Z',
        },
      }),
    }));

    const svc = await getService();
    const result = await svc.createTransaction(svc.buildPixPayload('TPW-1', 15000));

    expect(result.returnCode).toBe('00');
    expect(result.tid).toBe('tid-123');
    expect(result.pix?.qrCode).toBe('00020126...');
    expect(result.pix?.link).toBe('https://pix.link/qr');
  });

  it('lança AppError 502 quando gateway retorna erro', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ returnMessage: 'Cartão inválido' }),
    }));

    const svc = await getService();
    await expect(svc.createTransaction(svc.buildPixPayload('TPW-1', 1000)))
      .rejects.toMatchObject({ message: 'Cartão inválido', statusCode: 502 });
  });

  it('lança AppError 504 em timeout', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      const error = new Error('The operation was aborted');
      error.name = 'AbortError';
      return Promise.reject(error);
    }));

    const svc = await getService();
    await expect(svc.createTransaction(svc.buildPixPayload('TPW-1', 1000)))
      .rejects.toMatchObject({ statusCode: 504 });
  });

  it('lança AppError 500 quando credenciais não estão configuradas', async () => {
    delete process.env.EREDE_PV;
    delete process.env.EREDE_INTEGRATION_KEY;
    vi.resetModules();
    const mod = await import('../../../services/ERedeService');
    const svc = mod.default;

    await expect(svc.createTransaction({ kind: 'pix', reference: 'TPW-1', amount: 1000, expirationDate: '' }))
      .rejects.toMatchObject({ statusCode: 500 });
  });
});
```

- [ ] **Step 2B.2: Rodar e verificar RED → GREEN**

```bash
npm test -- src/__tests__/unit/services/ERedeService.test.ts
```

Resultado esperado: todos PASS. Se algum falhar, o motivo deve ser claro (ex: mock de fetch não funcionando — verificar que `vi.stubGlobal` está sendo chamado antes da importação ou usar `vi.resetModules`).

- [ ] **Step 2B.3: Commit**

```bash
git add src/__tests__/unit/services/ERedeService.test.ts
git commit -m "test: unit tests para ERedeService (payload, status mapping, callback)"
```

---

## Task 2C: Unit tests — AuthService

**Files:**
- Criar: `src/__tests__/unit/services/AuthService.test.ts`

**Pré-requisito:** Task 1 concluída.

- [ ] **Step 2C.1: Escrever testes (RED)**

Criar `src/__tests__/unit/services/AuthService.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StatusCodes } from 'http-status-codes';

// Mocks devem ser declarados antes dos imports do módulo alvo
vi.mock('../../../repositories/UserRepository', () => ({
  default: {
    findByEmail: vi.fn(),
    findByCpf: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('../../../repositories/ConsultantRepository', () => ({
  default: {
    findByCpf: vi.fn(),
    linkToUser: vi.fn(),
  },
}));

vi.mock('../../../repositories/PasswordResetRepository', () => ({
  default: {
    findByToken: vi.fn(),
    create: vi.fn(),
    invalidateAllForUser: vi.fn(),
    markAsUsed: vi.fn(),
  },
}));

vi.mock('../../../services/EmailService', () => ({
  default: { sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined) },
}));

import authService from '../../../services/AuthService';
import userRepository from '../../../repositories/UserRepository';
import consultantRepository from '../../../repositories/ConsultantRepository';
import passwordResetRepository from '../../../repositories/PasswordResetRepository';

// Helper: cria user mock com hash real de 'Senha@123'
const makeMockUser = (overrides: Record<string, unknown> = {}) => ({
  id: 'user-uuid-1',
  name: 'Test User',
  cpf: '11144477735',
  email: 'test@email.com',
  password: '$2a$10$hashedpassword', // substituído nos testes que precisam de login real
  role: 'CONSULTOR',
  isActive: true,
  phone: null,
  birthDate: null,
  address: null,
  addressNumber: null,
  addressComplement: null,
  neighbourhood: null,
  city: null,
  state: null,
  postalCode: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const makeResetRecord = (overrides: Record<string, unknown> = {}) => ({
  id: 'reset-1',
  userId: 'user-uuid-1',
  token: 'valid-token-abc',
  expiresAt: new Date(Date.now() + 3_600_000), // 1h no futuro
  used: false,
  createdAt: new Date(),
  user: makeMockUser(),
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.JWT_SECRET = 'test-secret-jwt';
  process.env.JWT_EXPIRES_IN = '1d';
  process.env.FRONTEND_URL = 'http://localhost:3000';
});

// ===== LOGIN =====
describe('AuthService.login', () => {
  it('retorna token e user (sem password) com credenciais válidas', async () => {
    const bcrypt = await import('bcryptjs');
    const hash = await bcrypt.hash('Senha@123', 10);
    vi.mocked(userRepository.findByEmail).mockResolvedValueOnce(makeMockUser({ password: hash }) as any);

    const result = await authService.login({ email: 'test@email.com', password: 'Senha@123' });

    expect(result.token).toBeDefined();
    expect(result.user.email).toBe('test@email.com');
    expect((result.user as any).password).toBeUndefined();
  });

  it('lança 401 quando usuário não existe', async () => {
    vi.mocked(userRepository.findByEmail).mockResolvedValueOnce(null);

    await expect(authService.login({ email: 'nao@existe.com', password: 'qualquer' }))
      .rejects.toMatchObject({ statusCode: StatusCodes.UNAUTHORIZED });
  });

  it('lança 401 com senha incorreta', async () => {
    vi.mocked(userRepository.findByEmail).mockResolvedValueOnce(makeMockUser() as any);

    await expect(authService.login({ email: 'test@email.com', password: 'senhaerrada' }))
      .rejects.toMatchObject({ statusCode: StatusCodes.UNAUTHORIZED });
  });

  it('mensagem de erro não revela se o e-mail existe (genérica)', async () => {
    vi.mocked(userRepository.findByEmail).mockResolvedValueOnce(null);

    const error: any = await authService.login({ email: 'nao@existe.com', password: 'x' }).catch(e => e);
    expect(error.message).toBe('E-mail ou senha incorretos.');
  });
});

// ===== REGISTER =====
describe('AuthService.register', () => {
  it('lança 400 para CPF inválido', async () => {
    await expect(authService.register({ name: 'X', cpf: '00000000000', email: 'x@x.com', password: 'pass' }))
      .rejects.toMatchObject({ statusCode: StatusCodes.BAD_REQUEST });
  });

  it('lança 409 quando e-mail já está cadastrado', async () => {
    vi.mocked(userRepository.findByEmail).mockResolvedValueOnce(makeMockUser() as any);

    await expect(authService.register({ name: 'X', cpf: '11144477735', email: 'test@email.com', password: 'pass' }))
      .rejects.toMatchObject({ statusCode: StatusCodes.CONFLICT });
  });

  it('lança 409 quando CPF já está cadastrado', async () => {
    vi.mocked(userRepository.findByEmail).mockResolvedValueOnce(null);
    vi.mocked(userRepository.findByCpf).mockResolvedValueOnce(makeMockUser() as any);

    await expect(authService.register({ name: 'X', cpf: '11144477735', email: 'novo@email.com', password: 'pass' }))
      .rejects.toMatchObject({ statusCode: StatusCodes.CONFLICT });
  });

  it('vincula consultor e define role=LIDER quando tipo=2', async () => {
    vi.mocked(userRepository.findByEmail).mockResolvedValueOnce(null);
    vi.mocked(userRepository.findByCpf).mockResolvedValueOnce(null);
    vi.mocked(userRepository.create).mockResolvedValueOnce(makeMockUser() as any);
    vi.mocked(consultantRepository.findByCpf).mockResolvedValueOnce({
      id: 'c1', tipo: 2, codigo: 'C001', grupo: 'G1', distrito: 'D1',
      cpf: '11144477735', userId: null, createdAt: new Date(), updatedAt: new Date(),
    } as any);
    vi.mocked(consultantRepository.linkToUser).mockResolvedValueOnce({} as any);
    vi.mocked(userRepository.update).mockResolvedValueOnce(makeMockUser({ role: 'LIDER' }) as any);

    const result = await authService.register({ name: 'Test', cpf: '11144477735', email: 'novo@email.com', password: 'Senha@123' });

    expect(consultantRepository.linkToUser).toHaveBeenCalledWith('c1', 'user-uuid-1');
    expect(result.user.role).toBe('LIDER');
  });

  it('define role=EMPRESARIA quando tipo=1', async () => {
    vi.mocked(userRepository.findByEmail).mockResolvedValueOnce(null);
    vi.mocked(userRepository.findByCpf).mockResolvedValueOnce(null);
    vi.mocked(userRepository.create).mockResolvedValueOnce(makeMockUser() as any);
    vi.mocked(consultantRepository.findByCpf).mockResolvedValueOnce({
      id: 'c2', tipo: 1, codigo: 'C002', grupo: 'G1', distrito: 'D1',
      cpf: '11144477735', userId: null, createdAt: new Date(), updatedAt: new Date(),
    } as any);
    vi.mocked(consultantRepository.linkToUser).mockResolvedValueOnce({} as any);
    vi.mocked(userRepository.update).mockResolvedValueOnce(makeMockUser({ role: 'EMPRESARIA' }) as any);

    const result = await authService.register({ name: 'Test', cpf: '11144477735', email: 'novo@email.com', password: 'pass' });
    expect(result.user.role).toBe('EMPRESARIA');
  });

  it('não falha quando não há consultor vinculado', async () => {
    vi.mocked(userRepository.findByEmail).mockResolvedValueOnce(null);
    vi.mocked(userRepository.findByCpf).mockResolvedValueOnce(null);
    vi.mocked(userRepository.create).mockResolvedValueOnce(makeMockUser() as any);
    vi.mocked(consultantRepository.findByCpf).mockResolvedValueOnce(null);

    const result = await authService.register({ name: 'Test', cpf: '11144477735', email: 'novo@email.com', password: 'pass' });
    expect(result.token).toBeDefined();
    expect(consultantRepository.linkToUser).not.toHaveBeenCalled();
  });
});

// ===== RESET PASSWORD =====
describe('AuthService.resetPassword', () => {
  it('lança 400 para token inexistente', async () => {
    vi.mocked(passwordResetRepository.findByToken).mockResolvedValueOnce(null);

    await expect(authService.resetPassword('token-invalido', 'novaSenha'))
      .rejects.toMatchObject({ statusCode: StatusCodes.BAD_REQUEST });
  });

  it('lança 400 para token já utilizado', async () => {
    vi.mocked(passwordResetRepository.findByToken).mockResolvedValueOnce(makeResetRecord({ used: true }) as any);

    await expect(authService.resetPassword('token-usado', 'novaSenha'))
      .rejects.toMatchObject({ statusCode: StatusCodes.BAD_REQUEST });
  });

  it('lança 400 para token expirado', async () => {
    vi.mocked(passwordResetRepository.findByToken).mockResolvedValueOnce(
      makeResetRecord({ expiresAt: new Date(Date.now() - 1000) }) as any,
    );

    await expect(authService.resetPassword('token-expirado', 'novaSenha'))
      .rejects.toMatchObject({ statusCode: StatusCodes.BAD_REQUEST });
  });

  it('atualiza senha e marca token como usado com token válido', async () => {
    vi.mocked(passwordResetRepository.findByToken).mockResolvedValueOnce(makeResetRecord() as any);
    vi.mocked(userRepository.update).mockResolvedValueOnce(makeMockUser() as any);
    vi.mocked(passwordResetRepository.markAsUsed).mockResolvedValueOnce({} as any);

    const result = await authService.resetPassword('valid-token-abc', 'novaSenha123');

    expect(userRepository.update).toHaveBeenCalledWith('user-uuid-1', expect.objectContaining({ password: expect.any(String) }));
    expect(passwordResetRepository.markAsUsed).toHaveBeenCalledWith('reset-1');
    expect(result.message).toBeDefined();
  });
});

// ===== FORGOT PASSWORD =====
describe('AuthService.forgotPassword', () => {
  it('retorna mensagem genérica quando e-mail não existe (não revela existência)', async () => {
    vi.mocked(userRepository.findByEmail).mockResolvedValueOnce(null);

    const result = await authService.forgotPassword('nao@existe.com');
    expect(result.message).toContain('Se o e-mail');
  });

  it('invalida tokens anteriores e cria novo token quando e-mail existe', async () => {
    vi.mocked(userRepository.findByEmail).mockResolvedValueOnce(makeMockUser() as any);
    vi.mocked(passwordResetRepository.invalidateAllForUser).mockResolvedValueOnce({} as any);
    vi.mocked(passwordResetRepository.create).mockResolvedValueOnce({} as any);

    await authService.forgotPassword('test@email.com');

    expect(passwordResetRepository.invalidateAllForUser).toHaveBeenCalledWith('user-uuid-1');
    expect(passwordResetRepository.create).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2C.2: Rodar e verificar**

```bash
npm test -- src/__tests__/unit/services/AuthService.test.ts
```

Resultado esperado: todos PASS.

- [ ] **Step 2C.3: Commit**

```bash
git add src/__tests__/unit/services/AuthService.test.ts
git commit -m "test: unit tests para AuthService (login, register, reset)"
```

---

## Task 2D: Unit tests — DebtService

**Files:**
- Criar: `src/__tests__/unit/services/DebtService.test.ts`

**Pré-requisito:** Task 1 concluída.

- [ ] **Step 2D.1: Escrever testes (RED)**

Criar `src/__tests__/unit/services/DebtService.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StatusCodes } from 'http-status-codes';

vi.mock('../../../repositories/DebtRepository', () => ({
  default: {
    findMany: vi.fn(),
    findById: vi.fn(),
  },
}));

vi.mock('../../../repositories/ConsultantRepository', () => ({
  default: {
    findByCpf: vi.fn(),
  },
}));

import debtService from '../../../services/DebtService';
import debtRepository from '../../../repositories/DebtRepository';
import consultantRepository from '../../../repositories/ConsultantRepository';

const mockConsultant = {
  id: 'c1',
  codigo: 'C001',
  tipo: 3,
  grupo: 'G1',
  distrito: 'D1',
  cpf: '11144477735',
  userId: 'u1',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockDebt = {
  id: 'd1',
  codigo: 'C001',
  nome: 'Maria Consultora',
  grupo: 'G1',
  distrito: 'D1',
  semana: 'S01/2026',
  valor: 150,
  diasAtraso: 5,
  dataVencimento: new Date('2026-01-01'),
  numeroNf: 'NF-0001',
  status: 'PENDENTE',
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(debtRepository.findMany).mockResolvedValue({ data: [mockDebt as any], total: 1 });
});

// ===== HIERARQUIA DE VISIBILIDADE =====
describe('DebtService.list — hierarquia de visibilidade', () => {
  it('ADMIN: não aplica filtro hierárquico (where sem distrito/grupo/codigo)', async () => {
    await debtService.list({ role: 'ADMIN', cpf: '' }, {});

    const call = vi.mocked(debtRepository.findMany).mock.calls[0][0];
    expect(call.where).not.toHaveProperty('distrito');
    expect(call.where).not.toHaveProperty('grupo');
    expect(call.where).not.toHaveProperty('codigo');
    expect(consultantRepository.findByCpf).not.toHaveBeenCalled();
  });

  it('GERENTE: não aplica filtro hierárquico (tratado como ADMIN)', async () => {
    await debtService.list({ role: 'GERENTE', cpf: '' }, {});

    const call = vi.mocked(debtRepository.findMany).mock.calls[0][0];
    expect(call.where).not.toHaveProperty('distrito');
    expect(call.where).not.toHaveProperty('grupo');
    expect(call.where).not.toHaveProperty('codigo');
  });

  it('EMPRESARIA: filtra por distrito do consultor', async () => {
    vi.mocked(consultantRepository.findByCpf).mockResolvedValueOnce(mockConsultant as any);

    await debtService.list({ role: 'EMPRESARIA', cpf: '11144477735' }, {});

    const call = vi.mocked(debtRepository.findMany).mock.calls[0][0];
    expect(call.where.distrito).toBe('D1');
  });

  it('LIDER: filtra por grupo do consultor', async () => {
    vi.mocked(consultantRepository.findByCpf).mockResolvedValueOnce(mockConsultant as any);

    await debtService.list({ role: 'LIDER', cpf: '11144477735' }, {});

    const call = vi.mocked(debtRepository.findMany).mock.calls[0][0];
    expect(call.where.grupo).toBe('G1');
  });

  it('CONSULTOR: filtra por codigo do consultor', async () => {
    vi.mocked(consultantRepository.findByCpf).mockResolvedValueOnce(mockConsultant as any);

    await debtService.list({ role: 'CONSULTOR', cpf: '11144477735' }, {});

    const call = vi.mocked(debtRepository.findMany).mock.calls[0][0];
    expect(call.where.codigo).toBe('C001');
  });

  it('CONSULTOR sem registro em consultants: lança 403', async () => {
    vi.mocked(consultantRepository.findByCpf).mockResolvedValueOnce(null);

    await expect(debtService.list({ role: 'CONSULTOR', cpf: '11144477735' }, {}))
      .rejects.toMatchObject({ statusCode: StatusCodes.FORBIDDEN });
  });

  it('EMPRESARIA sem registro em consultants: lança 403', async () => {
    vi.mocked(consultantRepository.findByCpf).mockResolvedValueOnce(null);

    await expect(debtService.list({ role: 'EMPRESARIA', cpf: '11144477735' }, {}))
      .rejects.toMatchObject({ statusCode: StatusCodes.FORBIDDEN });
  });
});

// ===== FILTROS =====
describe('DebtService.list — filtros da query', () => {
  beforeEach(() => {
    vi.mocked(debtRepository.findMany).mockResolvedValue({ data: [], total: 0 });
  });

  it('aplica filtro de status', async () => {
    await debtService.list({ role: 'ADMIN', cpf: '' }, { status: 'PAGO' });
    const call = vi.mocked(debtRepository.findMany).mock.calls[0][0];
    expect(call.where.status).toBe('PAGO');
  });

  it('aplica filtro de grupo', async () => {
    await debtService.list({ role: 'ADMIN', cpf: '' }, { grupo: 'G2' });
    const call = vi.mocked(debtRepository.findMany).mock.calls[0][0];
    expect(call.where.grupo).toBe('G2');
  });

  it('aplica filtro de distrito', async () => {
    await debtService.list({ role: 'ADMIN', cpf: '' }, { distrito: 'D3' });
    const call = vi.mocked(debtRepository.findMany).mock.calls[0][0];
    expect(call.where.distrito).toBe('D3');
  });

  it('aplica filtro de data de vencimento (início e fim)', async () => {
    await debtService.list({ role: 'ADMIN', cpf: '' }, {
      dataVencimentoInicio: '2026-01-01',
      dataVencimentoFim: '2026-03-31',
    });
    const call = vi.mocked(debtRepository.findMany).mock.calls[0][0];
    expect((call.where.dataVencimento as any).gte).toBeInstanceOf(Date);
    expect((call.where.dataVencimento as any).lte).toBeInstanceOf(Date);
  });

  it('aplica filtro de valor (min e max)', async () => {
    await debtService.list({ role: 'ADMIN', cpf: '' }, { valorMin: '100', valorMax: '500' });
    const call = vi.mocked(debtRepository.findMany).mock.calls[0][0];
    expect((call.where.valor as any).gte).toBe(100);
    expect((call.where.valor as any).lte).toBe(500);
  });
});

// ===== ORDENAÇÃO =====
describe('DebtService.list — ordenação', () => {
  beforeEach(() => {
    vi.mocked(debtRepository.findMany).mockResolvedValue({ data: [], total: 0 });
  });

  it('ordenação padrão: dataVencimento desc', async () => {
    await debtService.list({ role: 'ADMIN', cpf: '' }, {});
    const call = vi.mocked(debtRepository.findMany).mock.calls[0][0];
    expect(call.orderBy).toEqual({ dataVencimento: 'desc' });
  });

  it('ordena por diasAtraso asc', async () => {
    await debtService.list({ role: 'ADMIN', cpf: '' }, { sortBy: 'diasAtraso', sortOrder: 'asc' });
    const call = vi.mocked(debtRepository.findMany).mock.calls[0][0];
    expect(call.orderBy).toEqual({ diasAtraso: 'asc' });
  });

  it('ordena por valor desc', async () => {
    await debtService.list({ role: 'ADMIN', cpf: '' }, { sortBy: 'valor', sortOrder: 'desc' });
    const call = vi.mocked(debtRepository.findMany).mock.calls[0][0];
    expect(call.orderBy).toEqual({ valor: 'desc' });
  });

  it('ignora campo de ordenação inválido e usa padrão', async () => {
    await debtService.list({ role: 'ADMIN', cpf: '' }, { sortBy: 'campoInexistente' });
    const call = vi.mocked(debtRepository.findMany).mock.calls[0][0];
    expect(call.orderBy).toEqual({ dataVencimento: 'desc' });
  });
});

// ===== PAGINAÇÃO =====
describe('DebtService.list — paginação', () => {
  it('aplica skip e take corretos na página 2', async () => {
    vi.mocked(debtRepository.findMany).mockResolvedValue({ data: [], total: 30 });

    await debtService.list({ role: 'ADMIN', cpf: '' }, { page: '2', limit: '10' });

    const call = vi.mocked(debtRepository.findMany).mock.calls[0][0];
    expect(call.skip).toBe(10);
    expect(call.take).toBe(10);
  });

  it('resposta inclui metadados de paginação corretos', async () => {
    vi.mocked(debtRepository.findMany).mockResolvedValue({ data: [mockDebt as any], total: 30 });

    const result = await debtService.list({ role: 'ADMIN', cpf: '' }, { page: '1', limit: '10' });

    expect(result.pagination.total).toBe(30);
    expect(result.pagination.totalPages).toBe(3);
    expect(result.pagination.hasNextPage).toBe(true);
  });
});

// ===== FIND BY ID =====
describe('DebtService.findById', () => {
  it('retorna o débito quando existe', async () => {
    vi.mocked(debtRepository.findById).mockResolvedValueOnce(mockDebt as any);
    const result = await debtService.findById('d1');
    expect(result.id).toBe('d1');
  });

  it('lança 404 quando débito não existe', async () => {
    vi.mocked(debtRepository.findById).mockResolvedValueOnce(null);
    await expect(debtService.findById('nao-existe'))
      .rejects.toMatchObject({ statusCode: StatusCodes.NOT_FOUND });
  });
});
```

- [ ] **Step 2D.2: Rodar e verificar**

```bash
npm test -- src/__tests__/unit/services/DebtService.test.ts
```

Resultado esperado: todos PASS.

- [ ] **Step 2D.3: Commit**

```bash
git add src/__tests__/unit/services/DebtService.test.ts
git commit -m "test: unit tests para DebtService (hierarquia, filtros, paginação)"
```

---

## Task 2E: Unit tests — PaymentService

**Files:**
- Criar: `src/__tests__/unit/services/PaymentService.test.ts`

**Pré-requisito:** Task 1 concluída.

- [ ] **Step 2E.1: Escrever testes (RED)**

Criar `src/__tests__/unit/services/PaymentService.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StatusCodes } from 'http-status-codes';

vi.mock('../../../repositories/PaymentRepository', () => ({
  default: {
    create: vi.fn(),
    update: vi.fn(),
    findById: vi.fn(),
    findByUserId: vi.fn(),
    findByGatewayTransactionId: vi.fn(),
    findByReferenceNum: vi.fn(),
    countPendingByUser: vi.fn(),
  },
}));

vi.mock('../../../repositories/DebtRepository', () => ({
  default: {
    findByIds: vi.fn(),
    updateMany: vi.fn(),
  },
}));

vi.mock('../../../services/ERedeService', () => ({
  default: {
    buildPixPayload: vi.fn().mockReturnValue({ kind: 'pix', reference: 'TPW-mock', amount: 10000, expirationDate: '' }),
    buildCreditPayload: vi.fn().mockReturnValue({ kind: 'credit' }),
    createTransaction: vi.fn(),
    validateCallbackSignature: vi.fn(),
    mapStatusToLocal: vi.fn(),
  },
}));

vi.mock('../../../services/WebSocketService', () => ({
  default: { emitToUser: vi.fn() },
}));

vi.mock('../../../services/SavedCardService', () => ({
  default: { tokenizeAndSave: vi.fn() },
}));

vi.mock('../../../repositories/SettingsRepository', () => ({
  default: { get: vi.fn().mockResolvedValue('5') },
}));

import paymentService from '../../../services/PaymentService';
import paymentRepository from '../../../repositories/PaymentRepository';
import debtRepository from '../../../repositories/DebtRepository';
import eRedeService from '../../../services/ERedeService';
import webSocketService from '../../../services/WebSocketService';
import debtRepositoryMock from '../../../repositories/DebtRepository';

// ===== FACTORIES =====
const makeDebt = (id: string, status = 'PENDENTE', valor = 150) => ({
  id,
  codigo: 'C001',
  nome: 'Consultora Test',
  grupo: 'G1',
  distrito: 'D1',
  semana: 'S01',
  valor: String(valor),
  diasAtraso: 0,
  dataVencimento: new Date(),
  numeroNf: `NF-${id}`,
  status,
  createdAt: new Date(),
  updatedAt: new Date(),
  paymentDebts: [],
});

const makePayment = (id = 'p1', status = 'PENDENTE', method = 'PIX') => ({
  id,
  userId: 'user-uuid-1',
  method,
  installments: 1,
  subtotal: 150,
  fee: 0,
  totalValue: 150,
  status,
  gatewayProvider: 'EREDE',
  referenceNum: `TPW-${Date.now()}-user-uui`,
  gatewayTransactionId: 'tid-abc',
  gatewayOrderId: null,
  gatewayStatusCode: '00',
  gatewayStatusMessage: 'Aprovado',
  processorReference: null,
  paymentLink: 'https://pix.link/qr',
  qrCode: '00020126...',
  callbackPayload: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  paymentDebts: [{ debtId: 'd1' }],
});

const billingBase = {
  name: 'Test User',
  email: 'test@email.com',
  phone: '11999999999',
  document: '11144477735',
  birthDate: '1990-01-01',
  address: 'Rua Exemplo',
  district: 'Centro',
  city: 'São Paulo',
  state: 'SP',
  postalcode: '01310100',
};

const cardBase = {
  number: '4111111111111111',
  expMonth: '12',
  expYear: '2028',
  cvv: '123',
  holderName: 'TEST USER',
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.JWT_SECRET = 'test-secret';
  vi.mocked(paymentRepository.countPendingByUser).mockResolvedValue(0);
  vi.mocked(eRedeService.createTransaction).mockResolvedValue({
    tid: 'tid-abc',
    returnCode: '00',
    returnMessage: 'Aprovado',
    reference: 'TPW-mock',
    pix: { qrCode: '00020126...', link: 'https://pix.link', expirationDate: '2026-04-02T10:00:00Z' },
    raw: {},
  });
  vi.mocked(paymentRepository.create).mockResolvedValue(makePayment() as any);
  vi.mocked(paymentRepository.update).mockResolvedValue(makePayment('p1', 'PAGO') as any);
  vi.mocked(eRedeService.mapStatusToLocal).mockReturnValue('PAGO');
});

// ===== VALIDAÇÃO DE DÉBITOS =====
describe('PaymentService.create — validação de débitos', () => {
  it('lança 400 quando nenhum débito é encontrado', async () => {
    vi.mocked(debtRepository.findByIds).mockResolvedValueOnce([]);

    await expect(paymentService.create('user-uuid-1', { debtIds: ['nao-existe'], method: 'PIX', billing: billingBase }))
      .rejects.toMatchObject({ statusCode: StatusCodes.BAD_REQUEST });
  });

  it('lança 400 quando número de débitos retornados difere dos solicitados', async () => {
    vi.mocked(debtRepository.findByIds).mockResolvedValueOnce([makeDebt('d1') as any]);

    await expect(paymentService.create('user-uuid-1', { debtIds: ['d1', 'd2'], method: 'PIX', billing: billingBase }))
      .rejects.toMatchObject({ statusCode: StatusCodes.BAD_REQUEST });
  });

  it('lança 400 quando algum débito está PAGO', async () => {
    vi.mocked(debtRepository.findByIds).mockResolvedValueOnce([makeDebt('d1', 'PAGO') as any]);

    await expect(paymentService.create('user-uuid-1', { debtIds: ['d1'], method: 'PIX', billing: billingBase }))
      .rejects.toMatchObject({ statusCode: StatusCodes.BAD_REQUEST });
  });
});

// ===== REGRAS DE PARCELAMENTO =====
describe('PaymentService.create — regras de parcelamento (RF-14)', () => {
  it('lança 400: subtotal < R$300 com installments > 1', async () => {
    vi.mocked(debtRepository.findByIds).mockResolvedValueOnce([makeDebt('d1', 'PENDENTE', 100) as any]);

    await expect(paymentService.create('user-uuid-1', {
      debtIds: ['d1'],
      method: 'CARTAO_CREDITO',
      installments: 2,
      card: cardBase,
      billing: billingBase,
    })).rejects.toMatchObject({ statusCode: StatusCodes.BAD_REQUEST });
  });

  it('lança 400: total com fee entre R$300-499 com installments > 2', async () => {
    // subtotal=286, fee=5%=14.3, total=300.3 → entre 300 e 499
    vi.mocked(debtRepository.findByIds).mockResolvedValueOnce([makeDebt('d1', 'PENDENTE', 286) as any]);

    await expect(paymentService.create('user-uuid-1', {
      debtIds: ['d1'],
      method: 'CARTAO_CREDITO',
      installments: 3,
      card: cardBase,
      billing: billingBase,
    })).rejects.toMatchObject({ statusCode: StatusCodes.BAD_REQUEST });
  });

  it('lança 400: total >= R$500 com installments > 3', async () => {
    vi.mocked(debtRepository.findByIds).mockResolvedValueOnce([makeDebt('d1', 'PENDENTE', 500) as any]);

    await expect(paymentService.create('user-uuid-1', {
      debtIds: ['d1'],
      method: 'CARTAO_CREDITO',
      installments: 4,
      card: cardBase,
      billing: billingBase,
    })).rejects.toMatchObject({ statusCode: StatusCodes.BAD_REQUEST });
  });

  it('aceita: total >= R$500 com installments = 3', async () => {
    vi.mocked(debtRepository.findByIds).mockResolvedValueOnce([makeDebt('d1', 'PENDENTE', 500) as any]);

    const result = await paymentService.create('user-uuid-1', {
      debtIds: ['d1'],
      method: 'CARTAO_CREDITO',
      installments: 3,
      card: cardBase,
      billing: billingBase,
    });

    expect(result).toBeDefined();
  });
});

// ===== CÁLCULO DE FEE =====
describe('PaymentService.create — cálculo de fee (RF-13)', () => {
  it('aplica fee de 5% para cartão de crédito', async () => {
    vi.mocked(debtRepository.findByIds).mockResolvedValueOnce([makeDebt('d1', 'PENDENTE', 500) as any]);

    let capturedFee: number | undefined;
    let capturedTotal: number | undefined;

    vi.mocked(paymentRepository.create).mockImplementationOnce(async (data: any) => {
      capturedFee = data.fee;
      capturedTotal = data.totalValue;
      return makePayment() as any;
    });

    await paymentService.create('user-uuid-1', {
      debtIds: ['d1'],
      method: 'CARTAO_CREDITO',
      installments: 1,
      card: cardBase,
      billing: billingBase,
    });

    expect(capturedFee).toBeCloseTo(25); // 5% de 500
    expect(capturedTotal).toBeCloseTo(525); // 500 + 25
  });

  it('fee é zero para PIX', async () => {
    vi.mocked(debtRepository.findByIds).mockResolvedValueOnce([makeDebt('d1', 'PENDENTE', 150) as any]);

    let capturedFee: number | undefined;
    vi.mocked(paymentRepository.create).mockImplementationOnce(async (data: any) => {
      capturedFee = data.fee;
      return makePayment() as any;
    });

    await paymentService.create('user-uuid-1', { debtIds: ['d1'], method: 'PIX', billing: billingBase });

    expect(capturedFee).toBe(0);
  });
});

// ===== LIMITE DE LINKS ATIVOS =====
describe('PaymentService.create — limite de links ativos (RF-16)', () => {
  it('lança 429 quando usuário atingiu limite de 5 links ativos', async () => {
    vi.mocked(debtRepository.findByIds).mockResolvedValueOnce([makeDebt('d1') as any]);
    vi.mocked(paymentRepository.countPendingByUser).mockResolvedValueOnce(5);

    await expect(paymentService.create('user-uuid-1', { debtIds: ['d1'], method: 'PIX', billing: billingBase }))
      .rejects.toMatchObject({ statusCode: StatusCodes.TOO_MANY_REQUESTS });
  });

  it('prossegue quando usuário tem menos que o limite', async () => {
    vi.mocked(debtRepository.findByIds).mockResolvedValueOnce([makeDebt('d1') as any]);
    vi.mocked(paymentRepository.countPendingByUser).mockResolvedValueOnce(4);

    const result = await paymentService.create('user-uuid-1', { debtIds: ['d1'], method: 'PIX', billing: billingBase });
    expect(result).toBeDefined();
  });
});

// ===== FORMATO DE referenceNum =====
describe('PaymentService.create — referenceNum (RF-17)', () => {
  it('referenceNum segue formato TPW-{timestamp}-{userId[0:8]}', async () => {
    vi.mocked(debtRepository.findByIds).mockResolvedValueOnce([makeDebt('d1') as any]);

    let capturedRef: string | undefined;
    vi.mocked(paymentRepository.create).mockImplementationOnce(async (data: any) => {
      capturedRef = data.referenceNum;
      return makePayment() as any;
    });

    await paymentService.create('user-uuid-1', { debtIds: ['d1'], method: 'PIX', billing: billingBase });

    expect(capturedRef).toMatch(/^TPW-\d+-user-uui$/);
  });
});

// ===== PIX: sem parcelamento =====
describe('PaymentService.create — PIX', () => {
  it('lança 400 se PIX tiver installments > 1', async () => {
    vi.mocked(debtRepository.findByIds).mockResolvedValueOnce([makeDebt('d1') as any]);

    await expect(paymentService.create('user-uuid-1', {
      debtIds: ['d1'],
      method: 'PIX',
      installments: 2,
      billing: billingBase,
    })).rejects.toMatchObject({ statusCode: StatusCodes.BAD_REQUEST });
  });

  it('emite evento WebSocket payment:created após sucesso', async () => {
    vi.mocked(debtRepository.findByIds).mockResolvedValueOnce([makeDebt('d1') as any]);

    await paymentService.create('user-uuid-1', { debtIds: ['d1'], method: 'PIX', billing: billingBase });

    expect(webSocketService.emitToUser).toHaveBeenCalledWith('user-uuid-1', 'payment:created', expect.objectContaining({ paymentId: 'p1' }));
  });
});

// ===== CALLBACK =====
describe('PaymentService.processGatewayCallback', () => {
  it('lança 400 se assinatura inválida', async () => {
    vi.mocked(eRedeService.validateCallbackSignature).mockReturnValueOnce(false);

    await expect(paymentService.processGatewayCallback({ tid: '', returnCode: '', status: 0, reference: '', amount: 0 }))
      .rejects.toMatchObject({ statusCode: StatusCodes.BAD_REQUEST });
  });

  it('lança 400 se nem tid nem reference estão presentes', async () => {
    vi.mocked(eRedeService.validateCallbackSignature).mockReturnValueOnce(true);

    await expect(paymentService.processGatewayCallback({ tid: '', returnCode: '00', status: 0, reference: '', amount: 0 }))
      .rejects.toMatchObject({ statusCode: StatusCodes.BAD_REQUEST });
  });

  it('é idempotente quando status não mudou', async () => {
    vi.mocked(eRedeService.validateCallbackSignature).mockReturnValueOnce(true);
    vi.mocked(eRedeService.mapStatusToLocal).mockReturnValueOnce('PAGO');
    vi.mocked(paymentRepository.findByGatewayTransactionId).mockResolvedValueOnce(
      makePayment('p1', 'PAGO') as any,
    );

    const result = await paymentService.processGatewayCallback({ tid: 'tid-abc', returnCode: '00', status: 0, reference: 'TPW-1', amount: 1000 });

    expect(paymentRepository.update).not.toHaveBeenCalled();
    expect(result.id).toBe('p1');
  });

  it('atualiza débitos para PAGO quando pagamento fica PAGO', async () => {
    vi.mocked(eRedeService.validateCallbackSignature).mockReturnValueOnce(true);
    vi.mocked(eRedeService.mapStatusToLocal).mockReturnValueOnce('PAGO');
    vi.mocked(paymentRepository.findByGatewayTransactionId).mockResolvedValueOnce(
      { ...makePayment('p1', 'PENDENTE'), gatewayStatusCode: '99' } as any,
    );
    vi.mocked(paymentRepository.update).mockResolvedValueOnce(
      { ...makePayment('p1', 'PAGO'), paymentDebts: [{ debtId: 'd1' }, { debtId: 'd2' }] } as any,
    );

    await paymentService.processGatewayCallback({ tid: 'tid-abc', returnCode: '00', status: 0, reference: 'TPW-1', amount: 1000 });

    expect(debtRepositoryMock.updateMany).toHaveBeenCalledWith(
      { id: { in: ['d1', 'd2'] } },
      { status: 'PAGO' },
    );
  });

  it('emite payment:updated via WebSocket após atualização', async () => {
    vi.mocked(eRedeService.validateCallbackSignature).mockReturnValueOnce(true);
    vi.mocked(eRedeService.mapStatusToLocal).mockReturnValueOnce('CANCELADO');
    vi.mocked(paymentRepository.findByGatewayTransactionId).mockResolvedValueOnce(
      { ...makePayment('p1', 'PENDENTE'), gatewayStatusCode: '99' } as any,
    );
    vi.mocked(paymentRepository.update).mockResolvedValueOnce(makePayment('p1', 'CANCELADO') as any);

    await paymentService.processGatewayCallback({ tid: 'tid-abc', returnCode: '04', status: 4, reference: 'TPW-1', amount: 1000 });

    expect(webSocketService.emitToUser).toHaveBeenCalledWith(
      'user-uuid-1',
      'payment:updated',
      expect.objectContaining({ status: 'CANCELADO' }),
    );
  });
});

// ===== REABRIR PAGAMENTO =====
describe('PaymentService.reopenPayment', () => {
  it('lança 404 quando pagamento não existe', async () => {
    vi.mocked(paymentRepository.findById).mockResolvedValueOnce(null);

    await expect(paymentService.reopenPayment('user-uuid-1', 'nao-existe'))
      .rejects.toMatchObject({ statusCode: StatusCodes.NOT_FOUND });
  });

  it('lança 403 quando pagamento pertence a outro usuário', async () => {
    vi.mocked(paymentRepository.findById).mockResolvedValueOnce(
      { ...makePayment(), userId: 'outro-user' } as any,
    );

    await expect(paymentService.reopenPayment('user-uuid-1', 'p1'))
      .rejects.toMatchObject({ statusCode: StatusCodes.FORBIDDEN });
  });

  it('lança 400 quando pagamento não está PENDENTE', async () => {
    vi.mocked(paymentRepository.findById).mockResolvedValueOnce(makePayment('p1', 'PAGO') as any);

    await expect(paymentService.reopenPayment('user-uuid-1', 'p1'))
      .rejects.toMatchObject({ statusCode: StatusCodes.BAD_REQUEST });
  });

  it('lança 400 ao tentar reabrir pagamento com CARTAO_CREDITO expirado', async () => {
    const yesterday = new Date(Date.now() - 86_400_000);
    vi.mocked(paymentRepository.findById).mockResolvedValueOnce({
      ...makePayment('p1', 'PENDENTE', 'CARTAO_CREDITO'),
      method: 'CARTAO_CREDITO',
      createdAt: yesterday,
    } as any);

    await expect(paymentService.reopenPayment('user-uuid-1', 'p1'))
      .rejects.toMatchObject({ statusCode: StatusCodes.BAD_REQUEST });
  });

  it('retorna link PIX existente sem nova transação quando criado hoje', async () => {
    vi.mocked(paymentRepository.findById).mockResolvedValueOnce({
      ...makePayment('p1', 'PENDENTE', 'PIX'),
      createdAt: new Date(), // hoje
    } as any);

    const result = await paymentService.reopenPayment('user-uuid-1', 'p1');

    expect(eRedeService.createTransaction).not.toHaveBeenCalled();
    expect(result.checkoutUrl).toBe('https://pix.link/qr');
    expect((result as any).reopened).toBe(false);
  });
});
```

- [ ] **Step 2E.2: Rodar e verificar**

```bash
npm test -- src/__tests__/unit/services/PaymentService.test.ts
```

Resultado esperado: todos PASS. Se `SettingsRepository` causar problemas com import dinâmico, verificar que o mock está declarado antes dos outros imports.

- [ ] **Step 2E.3: Rodar todos os unit tests juntos**

```bash
npm test
```

Resultado esperado: todos PASS — utils + 4 services.

- [ ] **Step 2E.4: Commit**

```bash
git add src/__tests__/unit/services/PaymentService.test.ts
git commit -m "test: unit tests para PaymentService (parcelamento, fee, callback, reopen)"
```

---

## Task 3: Integration tests — Auth, Debts, Payments

**Files:**
- Criar: `src/__tests__/helpers/factories.ts`
- Criar: `src/__tests__/helpers/testClient.ts`
- Criar: `src/__tests__/integration/auth.test.ts`
- Criar: `src/__tests__/integration/debts.test.ts`
- Criar: `src/__tests__/integration/payments.test.ts`

**Pré-requisito:** Tasks 2A–2E concluídas. Banco MariaDB de teste disponível via `DATABASE_URL_TEST` no `.env.test`.

**Antes de começar:** criar `.env.test` com:
```
DATABASE_URL=mysql://user:pass@localhost:3306/tuppeware_test
JWT_SECRET=test-secret-integration
EREDE_PV=test-pv
EREDE_INTEGRATION_KEY=test-key
NODE_ENV=test
```

- [ ] **Step 3.1: Criar `src/__tests__/helpers/factories.ts`**

```typescript
import bcrypt from 'bcryptjs';
import prisma from '../../config/database';

export async function createUser(overrides: {
  name?: string;
  cpf?: string;
  email?: string;
  password?: string;
  role?: 'ADMIN' | 'GERENTE' | 'EMPRESARIA' | 'LIDER' | 'CONSULTOR';
  isActive?: boolean;
} = {}) {
  const password = overrides.password || 'Senha@123';
  const hash = await bcrypt.hash(password, 10);

  return prisma.user.create({
    data: {
      name: overrides.name || 'Test User',
      cpf: overrides.cpf || '11144477735',
      email: overrides.email || `test-${Date.now()}@email.com`,
      password: hash,
      role: overrides.role || 'CONSULTOR',
      isActive: overrides.isActive ?? true,
    },
  });
}

export async function createConsultant(userId: string, overrides: {
  codigo?: string;
  tipo?: number;
  grupo?: string;
  distrito?: string;
  cpf?: string;
} = {}) {
  return prisma.consultant.create({
    data: {
      codigo: overrides.codigo || `C${Date.now()}`,
      tipo: overrides.tipo || 3,
      grupo: overrides.grupo || 'G-TEST',
      distrito: overrides.distrito || 'D-TEST',
      cpf: overrides.cpf || '11144477735',
      userId,
    },
  });
}

export async function createDebt(overrides: {
  codigo?: string;
  nome?: string;
  grupo?: string;
  distrito?: string;
  valor?: number;
  status?: 'PENDENTE' | 'ATRASADO' | 'PAGO';
  numeroNf?: string;
} = {}) {
  return prisma.debt.create({
    data: {
      codigo: overrides.codigo || 'C001',
      nome: overrides.nome || 'Consultora Test',
      grupo: overrides.grupo || 'G-TEST',
      distrito: overrides.distrito || 'D-TEST',
      semana: 'S01/2026',
      valor: overrides.valor || 150,
      diasAtraso: 0,
      dataVencimento: new Date('2026-06-01'),
      numeroNf: overrides.numeroNf || `NF-${Date.now()}`,
      status: overrides.status || 'PENDENTE',
    },
  });
}

export async function cleanDatabase() {
  await prisma.paymentDebt.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.debt.deleteMany();
  await prisma.passwordReset.deleteMany();
  await prisma.savedCard.deleteMany();
  await prisma.consultant.deleteMany();
  await prisma.user.deleteMany();
}
```

- [ ] **Step 3.2: Criar `src/__tests__/helpers/testClient.ts`**

```typescript
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../app';

export const api = request(app);

export function authHeader(userId: string, role: string, email: string) {
  const token = jwt.sign(
    { id: userId, role, email },
    process.env.JWT_SECRET || 'test-secret-integration',
    { expiresIn: '1h' },
  );
  return { Authorization: `Bearer ${token}` };
}
```

- [ ] **Step 3.3: Criar `src/__tests__/integration/auth.test.ts`**

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { api } from '../helpers/testClient';
import { createUser, cleanDatabase } from '../helpers/factories';
import prisma from '../../config/database';

beforeAll(async () => {
  await cleanDatabase();
});

afterAll(async () => {
  await cleanDatabase();
  await prisma.$disconnect();
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await cleanDatabase();
    await createUser({ email: 'login@test.com', cpf: '11144477735', password: 'Senha@123' });
  });

  it('retorna 200 com token e user para credenciais válidas', async () => {
    const res = await api.post('/api/auth/login').send({ email: 'login@test.com', password: 'Senha@123' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe('login@test.com');
    expect(res.body.user.password).toBeUndefined();
  });

  it('retorna 401 para senha incorreta', async () => {
    const res = await api.post('/api/auth/login').send({ email: 'login@test.com', password: 'errada' });
    expect(res.status).toBe(401);
  });

  it('retorna 401 para e-mail inexistente', async () => {
    const res = await api.post('/api/auth/login').send({ email: 'nao@existe.com', password: 'qualquer' });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/register', () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  it('retorna 201 com token e user para dados válidos', async () => {
    const res = await api.post('/api/auth/register').send({
      name: 'New User',
      cpf: '11144477735',
      email: 'new@test.com',
      password: 'Senha@123',
    });

    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe('new@test.com');
  });

  it('retorna 422 para CPF inválido', async () => {
    const res = await api.post('/api/auth/register').send({
      name: 'X',
      cpf: '00000000000',
      email: 'x@x.com',
      password: 'pass',
    });
    expect(res.status).toBe(400); // AppError 400 para CPF inválido
  });

  it('retorna 409 quando CPF já existe', async () => {
    await createUser({ cpf: '11144477735', email: 'existing@test.com' });

    const res = await api.post('/api/auth/register').send({
      name: 'Y',
      cpf: '11144477735',
      email: 'new2@test.com',
      password: 'pass',
    });
    expect(res.status).toBe(409);
  });
});
```

- [ ] **Step 3.4: Criar `src/__tests__/integration/debts.test.ts`**

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { api, authHeader } from '../helpers/testClient';
import { createUser, createConsultant, createDebt, cleanDatabase } from '../helpers/factories';
import prisma from '../../config/database';

let adminUser: any;
let consultorUser: any;
let liderUser: any;

beforeAll(async () => {
  await cleanDatabase();

  adminUser = await createUser({ email: 'admin@test.com', cpf: '11144477735', role: 'ADMIN' });

  consultorUser = await createUser({ email: 'consultor@test.com', cpf: '52998224725', role: 'CONSULTOR' });
  await createConsultant(consultorUser.id, { codigo: 'C001', tipo: 3, grupo: 'G1', distrito: 'D1', cpf: '52998224725' });

  liderUser = await createUser({ email: 'lider@test.com', cpf: '71428793860', role: 'LIDER' });
  await createConsultant(liderUser.id, { codigo: 'L001', tipo: 2, grupo: 'G1', distrito: 'D1', cpf: '71428793860' });

  // Débitos: G1/D1 para consultor, G2/D2 para outro
  await createDebt({ codigo: 'C001', grupo: 'G1', distrito: 'D1', numeroNf: 'NF-001' });
  await createDebt({ codigo: 'C001', grupo: 'G1', distrito: 'D1', numeroNf: 'NF-002' });
  await createDebt({ codigo: 'C002', grupo: 'G2', distrito: 'D2', numeroNf: 'NF-003' });
});

afterAll(async () => {
  await cleanDatabase();
  await prisma.$disconnect();
});

describe('GET /api/debts', () => {
  it('ADMIN: retorna todos os débitos', async () => {
    const res = await api.get('/api/debts').set(authHeader(adminUser.id, 'ADMIN', adminUser.email));

    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBe(3);
  });

  it('CONSULTOR: retorna apenas débitos do seu código', async () => {
    const res = await api.get('/api/debts').set(authHeader(consultorUser.id, 'CONSULTOR', consultorUser.email));

    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBe(2);
    res.body.data.forEach((d: any) => expect(d.codigo).toBe('C001'));
  });

  it('LIDER: retorna débitos do seu grupo', async () => {
    const res = await api.get('/api/debts').set(authHeader(liderUser.id, 'LIDER', liderUser.email));

    expect(res.status).toBe(200);
    // G1 tem NF-001 e NF-002
    expect(res.body.pagination.total).toBe(2);
  });

  it('retorna 401 sem token', async () => {
    const res = await api.get('/api/debts');
    expect(res.status).toBe(401);
  });

  it('filtra por status=PENDENTE', async () => {
    const res = await api.get('/api/debts?status=PENDENTE').set(authHeader(adminUser.id, 'ADMIN', adminUser.email));
    expect(res.status).toBe(200);
    res.body.data.forEach((d: any) => expect(d.status).toBe('PENDENTE'));
  });

  it('paginação: retorna estrutura correta', async () => {
    const res = await api.get('/api/debts?page=1&limit=2').set(authHeader(adminUser.id, 'ADMIN', adminUser.email));
    expect(res.status).toBe(200);
    expect(res.body.pagination).toMatchObject({
      page: 1,
      limit: 2,
      total: 3,
      totalPages: 2,
    });
    expect(res.body.data).toHaveLength(2);
  });
});
```

- [ ] **Step 3.5: Criar `src/__tests__/integration/payments.test.ts`**

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { api, authHeader } from '../helpers/testClient';
import { createUser, createDebt, cleanDatabase } from '../helpers/factories';
import prisma from '../../config/database';

// Mock do ERedeService para integration tests — não chamar gateway real
vi.mock('../../services/ERedeService', () => ({
  default: {
    buildPixPayload: vi.fn().mockReturnValue({ kind: 'pix', reference: 'TPW-mock', amount: 15000, expirationDate: '' }),
    buildCreditPayload: vi.fn().mockReturnValue({ kind: 'credit' }),
    createTransaction: vi.fn().mockResolvedValue({
      tid: 'tid-integration-test',
      returnCode: '00',
      returnMessage: 'Aprovado',
      reference: 'TPW-mock',
      pix: { qrCode: '00020126...', link: 'https://pix.link/qr', expirationDate: '2026-04-02T10:00:00Z' },
      raw: {},
    }),
    validateCallbackSignature: vi.fn().mockReturnValue(true),
    mapStatusToLocal: vi.fn().mockReturnValue('PAGO'),
  },
}));

vi.mock('../../services/WebSocketService', () => ({
  default: { emitToUser: vi.fn() },
}));

let user: any;
let debt1: any;
let debt2: any;

beforeAll(async () => {
  await cleanDatabase();
  user = await createUser({ email: 'payment-user@test.com', cpf: '11144477735', role: 'CONSULTOR' });
  debt1 = await createDebt({ valor: 150, numeroNf: 'NF-PAY-001' });
  debt2 = await createDebt({ valor: 200, numeroNf: 'NF-PAY-002' });
});

afterAll(async () => {
  await cleanDatabase();
  await prisma.$disconnect();
});

const billingBase = {
  name: 'Test User',
  email: 'test@email.com',
  phone: '11999999999',
  document: '11144477735',
  birthDate: '1990-01-01',
  address: 'Rua Exemplo',
  district: 'Centro',
  city: 'São Paulo',
  state: 'SP',
  postalcode: '01310100',
};

describe('POST /api/payments', () => {
  it('cria pagamento PIX e retorna qrCode + checkoutUrl', async () => {
    const res = await api
      .post('/api/payments')
      .set(authHeader(user.id, 'CONSULTOR', user.email))
      .send({ debtIds: [debt1.id], method: 'PIX', billing: billingBase });

    expect(res.status).toBe(201);
    expect(res.body.qrCode).toBeDefined();
    expect(res.body.checkoutUrl).toBeDefined();
  });

  it('retorna 400 para débito já pago', async () => {
    const paidDebt = await createDebt({ status: 'PAGO', numeroNf: 'NF-PAID-001' });

    const res = await api
      .post('/api/payments')
      .set(authHeader(user.id, 'CONSULTOR', user.email))
      .send({ debtIds: [paidDebt.id], method: 'PIX', billing: billingBase });

    expect(res.status).toBe(400);
  });

  it('retorna 400 para installments inválido (valor < 300, parcelas > 1)', async () => {
    const smallDebt = await createDebt({ valor: 100, numeroNf: 'NF-SMALL-001' });

    const res = await api
      .post('/api/payments')
      .set(authHeader(user.id, 'CONSULTOR', user.email))
      .send({
        debtIds: [smallDebt.id],
        method: 'CARTAO_CREDITO',
        installments: 2,
        card: { number: '4111111111111111', expMonth: '12', expYear: '2028', cvv: '123', holderName: 'TEST' },
        billing: billingBase,
      });

    expect(res.status).toBe(400);
  });

  it('retorna 401 sem autenticação', async () => {
    const res = await api.post('/api/payments').send({ debtIds: [debt1.id], method: 'PIX', billing: billingBase });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/payments/:id', () => {
  it('retorna o pagamento do próprio usuário', async () => {
    // Criar pagamento primeiro
    const createRes = await api
      .post('/api/payments')
      .set(authHeader(user.id, 'CONSULTOR', user.email))
      .send({ debtIds: [debt2.id], method: 'PIX', billing: billingBase });

    const paymentId = createRes.body.id;

    const res = await api
      .get(`/api/payments/${paymentId}`)
      .set(authHeader(user.id, 'CONSULTOR', user.email));

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(paymentId);
  });

  it('retorna 403 ao tentar acessar pagamento de outro usuário', async () => {
    const otherUser = await createUser({ email: 'other@test.com', cpf: '52998224725' });

    const createRes = await api
      .post('/api/payments')
      .set(authHeader(user.id, 'CONSULTOR', user.email))
      .send({ debtIds: [await createDebt({ numeroNf: `NF-OTHER-${Date.now()}` }).then(d => d.id)], method: 'PIX', billing: billingBase });

    const res = await api
      .get(`/api/payments/${createRes.body.id}`)
      .set(authHeader(otherUser.id, 'CONSULTOR', otherUser.email));

    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 3.6: Rodar integration tests**

```bash
npm run test:integration
```

Resultado esperado: todos PASS. Se falhar por conexão com banco, verificar `.env.test` e que o banco `tuppeware_test` existe e as migrations foram aplicadas (`DATABASE_URL` apontando para `tuppeware_test` antes de rodar `prisma migrate dev`).

- [ ] **Step 3.7: Commit**

```bash
git add src/__tests__/helpers/ src/__tests__/integration/
git commit -m "test: integration tests para auth, debts e payments"
```

---

## Task 4: Auditoria de código vs. requisitos

**Files:**
- Criar: `docs/project/audit-2026-04-01.md`

**Pré-requisito:** Tasks 2A–2E e Task 3 concluídas com todos os testes passando.

- [ ] **Step 4.1: Rodar cobertura de testes e registrar baseline**

```bash
npm run test:coverage
```

Copiar o sumário de cobertura para `docs/project/audit-2026-04-01.md`.

- [ ] **Step 4.2: Verificar cada RF contra o código e testes**

Para cada requisito funcional em `docs/project/requirements.md`, verificar:
1. Existe implementação em `src/`?
2. Existe pelo menos um teste (unit ou integration) que o cobre?
3. Status: ✅ Implementado + testado | ⚠️ Implementado sem teste | ❌ Não implementado

Criar `docs/project/audit-2026-04-01.md`:

```markdown
# Auditoria de Requisitos — 2026-04-01

## Cobertura de testes (baseline)

[colar saída do npm run test:coverage aqui]

## Status por requisito

| # | Requisito | Implementado? | Testado? | Observação |
|---|---|---|---|---|
| RF-01 | Login JWT | ✅ | ✅ | AuthService + integration auth |
| RF-02 | Reset de senha | ✅ | ✅ | AuthService unit |
| RF-03 | Roles | ✅ | ⚠️ | Schema + middleware, falta teste de roleMiddleware isolado |
| RF-04 | CRUD usuários | ✅ | ⚠️ | UserService implementado, sem testes |
| RF-05 | Validação CPF | ✅ | ✅ | cpfValidator.test.ts |
| RF-06 | Listagem débitos | ✅ | ✅ | DebtService + integration |
| RF-07 | Paginação débitos | ✅ | ✅ | pagination.test.ts + integration |
| RF-08 | Hierarquia visibilidade | ✅ | ✅ | DebtService unit |
| RF-09 | Ordenação débitos | ✅ | ✅ | DebtService unit |
| RF-10 | 403 sem consultor | ✅ | ✅ | DebtService unit |
| RF-11 | PIX eRede | ✅ | ✅ | PaymentService unit + integration |
| RF-12 | Cartão de crédito | ✅ | ✅ | PaymentService unit |
| RF-13 | Fee 5% cartão | ✅ | ✅ | PaymentService unit |
| RF-14 | Regras parcelamento | ✅ | ✅ | PaymentService unit (3 cenários) |
| RF-15 | Rejeitar débito PAGO | ✅ | ✅ | PaymentService unit + integration |
| RF-16 | Limite links ativos | ✅ | ✅ | PaymentService unit |
| RF-17 | referenceNum format | ✅ | ✅ | PaymentService unit |
| RF-18 | Callback atualiza status | ✅ | ✅ | PaymentService unit |
| RF-19 | Idempotência callback | ✅ | ✅ | PaymentService unit |
| RF-20 | Reabrir pagamento | ✅ | ✅ | PaymentService unit |
| RF-21 | Tokenização cartão | ✅ | ⚠️ | SavedCardService sem testes |
| RF-22 | Import CSV débitos | ✅ | ❌ | CsvImportService sem testes |
| RF-23 | Import CSV consultoras | ✅ | ❌ | Sem testes |
| RF-24 | Erro por linha CSV | ✅ | ❌ | Sem testes |
| RF-25 | Admin atualiza status | ✅ | ⚠️ | PaymentService.updateStatus sem teste direto |
| RF-26 | WS payment:created | ✅ | ✅ | PaymentService unit (emitToUser mock) |
| RF-27 | WS payment:updated | ✅ | ✅ | PaymentService unit |

## Gaps identificados (backlog de testes)

1. **CsvImportService** — RF-22, RF-23, RF-24 sem cobertura
2. **SavedCardService** — RF-21 sem cobertura
3. **roleMiddleware** — RNF middleware sem teste isolado
4. **UserService/UserController** — RF-04 sem testes
5. **AdminController** — RF-25 sem integration test
6. **PaymentHistoryController** — sem testes de rota
7. **ERedeService.tokenizeCard** — método sem cobertura de teste
8. **ERedeService.queryTransaction** — método sem cobertura de teste
```

- [ ] **Step 4.3: Commit da auditoria**

```bash
git add docs/project/audit-2026-04-01.md
git commit -m "docs: auditoria de requisitos com baseline de cobertura de testes"
```

---

## Verificação Final

Após todas as tasks:

```bash
# Unit tests
npm test

# Integration tests (requer banco)
npm run test:integration

# Cobertura
npm run test:coverage
```

**Critério de sucesso:**
- Todos os unit tests passam sem banco disponível
- Todos os integration tests passam com banco de teste
- Auditoria documenta gaps para próximos ciclos TDD
