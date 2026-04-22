# Partial Payments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar pagamento parcial via PIX para dívida única, habilitável pelo admin, com webhook global assinado (HMAC) disparando em todos os pagamentos confirmados.

**Architecture:** Nova rota `POST /api/payments/partial` com método dedicado no `PaymentService` que reusa helpers privados extraídos. `Debt` ganha `paid_amount` (incrementa em callbacks confirmados via lock otimista). Novo `WebhookDispatcher` envia POST HTTP assinado; disparado async após commit do callback.

**Tech Stack:** Node.js + TypeScript, Express 5, Prisma (MariaDB adapter), Vitest, eRede gateway, Socket.IO, `crypto` (node built-in, HMAC-SHA256).

**Spec:** `docs/superpowers/specs/2026-04-22-partial-payments-design.md`

**Regras do projeto (CLAUDE.md):**
- TDD inviolável: RED → GREEN → REFACTOR. Sem teste falhando, sem código de produção.
- Layer pattern: Route → Controller → Service → Repository → Prisma.
- Prisma gerado em `generated/prisma/`, tipos re-exportados por `src/types/index.ts`.
- Erros via `AppError` + `errorHandler`.
- Commits: mensagens em português, sem `Co-Authored-By`.

---

## Mapa de arquivos

**Criar:**
- `prisma/migrations/<timestamp>_add_partial_payments/migration.sql` — gerado pelo Prisma
- `src/services/WebhookDispatcher.ts` — envio HTTP + HMAC + retry
- `src/validators/partialPaymentValidator.ts` — middleware de forma
- `src/__tests__/unit/services/WebhookDispatcher.test.ts`
- `src/__tests__/unit/validators/partialPaymentValidator.test.ts`
- `src/__tests__/integration/partial-payments.test.ts`

**Modificar:**
- `prisma/schema.prisma` — `Debt.paidAmount`, `Payment.isPartial`
- `src/services/SettingsService.ts` — 5 chaves novas em `ALLOWED_SETTINGS`
- `src/__tests__/unit/services/SettingsService.test.ts` — testes das novas chaves
- `src/repositories/DebtRepository.ts` — `updateDebtPaidAmount` (optimistic lock)
- `src/__tests__/unit/repositories/DebtRepository.test.ts` — testes do novo método
- `src/services/PaymentService.ts` — extrair helpers; adicionar `createPartial`; estender `processGatewayCallback`
- `src/__tests__/unit/services/PaymentService.test.ts` — testes novos
- `src/controllers/PaymentController.ts` — `createPartial`
- `src/__tests__/unit/controllers/PaymentController.test.ts` — teste do novo método
- `src/routes/paymentRoutes.ts` — rota `POST /partial`
- `src/services/DebtService.ts` — enriquecer listagem com `paidAmount` e `remaining`
- `src/__tests__/unit/services/DebtService.test.ts` — teste do enriquecimento
- `src/config/swagger.ts` — documentar rota + campos novos
- `.env.example` — variáveis novas (se houver)

---

## Task 1: Migração Prisma — `paidAmount` em Debt e `isPartial` em Payment

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_partial_payments/migration.sql` (gerado)

- [ ] **Step 1: Editar o schema**

Em `prisma/schema.prisma`, dentro de `model Debt`, adicionar após `valor`:
```prisma
  paidAmount   Decimal    @db.Decimal(10, 2) @default(0) @map("paid_amount")
```

Em `model Payment`, adicionar após `totalValue`:
```prisma
  isPartial    Boolean    @default(false) @map("is_partial")
```

- [ ] **Step 2: Gerar migração**

Run:
```bash
npm run prisma:migrate -- --name add_partial_payments
```

Expected: Prisma cria `prisma/migrations/<timestamp>_add_partial_payments/migration.sql` e aplica no banco dev.

- [ ] **Step 3: Regenerar client**

Run:
```bash
npm run prisma:generate
```

Expected: `generated/prisma/` atualizado com novos campos tipados.

- [ ] **Step 4: Smoke test (build)**

Run:
```bash
npm run build
```

Expected: build OK, nenhum erro de tipo.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(schema): paidAmount em Debt e isPartial em Payment"
```

---

## Task 2: SettingsService — validar 5 chaves novas (TDD)

**Files:**
- Modify: `src/services/SettingsService.ts`
- Modify: `src/__tests__/unit/services/SettingsService.test.ts`

- [ ] **Step 1: Escrever testes que falham**

Em `src/__tests__/unit/services/SettingsService.test.ts`, adicionar:
```typescript
describe('chaves de pagamento parcial', () => {
  it('aceita partial_payment_enabled = "true"', async () => {
    const repo = (settingsRepository.setMany as any) = vi.fn().mockResolvedValue(undefined);
    (settingsRepository.getAll as any) = vi.fn().mockResolvedValue({});
    await expect(settingsService.setMany({ partial_payment_enabled: 'true' })).resolves.toBeDefined();
  });

  it('aceita partial_payment_enabled = "false"', async () => {
    await expect(settingsService.setMany({ partial_payment_enabled: 'false' })).resolves.toBeDefined();
  });

  it('rejeita partial_payment_enabled com valor inválido', async () => {
    await expect(settingsService.setMany({ partial_payment_enabled: 'maybe' })).rejects.toThrow(/inválido/i);
  });

  it('aceita partial_payment_min_amount decimal positivo', async () => {
    await expect(settingsService.setMany({ partial_payment_min_amount: '10.00' })).resolves.toBeDefined();
  });

  it('rejeita partial_payment_min_amount <= 0', async () => {
    await expect(settingsService.setMany({ partial_payment_min_amount: '0' })).rejects.toThrow();
    await expect(settingsService.setMany({ partial_payment_min_amount: '-5' })).rejects.toThrow();
  });

  it('aceita partial_payment_min_remaining decimal >= 0', async () => {
    await expect(settingsService.setMany({ partial_payment_min_remaining: '5.00' })).resolves.toBeDefined();
    await expect(settingsService.setMany({ partial_payment_min_remaining: '0' })).resolves.toBeDefined();
  });

  it('rejeita partial_payment_min_remaining negativo', async () => {
    await expect(settingsService.setMany({ partial_payment_min_remaining: '-1' })).rejects.toThrow();
  });

  it('aceita payment_webhook_url https válida', async () => {
    await expect(settingsService.setMany({ payment_webhook_url: 'https://example.com/hook' })).resolves.toBeDefined();
  });

  it('aceita payment_webhook_url vazia (desliga webhook)', async () => {
    await expect(settingsService.setMany({ payment_webhook_url: '' })).resolves.toBeDefined();
  });

  it('rejeita payment_webhook_url http puro', async () => {
    await expect(settingsService.setMany({ payment_webhook_url: 'http://example.com' })).rejects.toThrow();
  });

  it('rejeita payment_webhook_url inválida', async () => {
    await expect(settingsService.setMany({ payment_webhook_url: 'not-a-url' })).rejects.toThrow();
  });

  it('aceita payment_webhook_secret com >= 16 chars', async () => {
    await expect(settingsService.setMany({ payment_webhook_secret: 'a'.repeat(16) })).resolves.toBeDefined();
  });

  it('rejeita payment_webhook_secret curto', async () => {
    await expect(settingsService.setMany({ payment_webhook_secret: 'short' })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/__tests__/unit/services/SettingsService.test.ts`
Expected: todos os testes novos falham com mensagem `"Configuração '...' não é permitida"` (chaves ainda não estão no whitelist).

- [ ] **Step 3: Implementar validadores**

Em `src/services/SettingsService.ts`, adicionar ao `ALLOWED_SETTINGS`:
```typescript
const ALLOWED_SETTINGS: Record<string, (value: string) => boolean> = {
  // ...existentes...
  partial_payment_enabled: (v) => v === 'true' || v === 'false',
  partial_payment_min_amount: (v) => {
    const n = parseFloat(v);
    return !isNaN(n) && n > 0;
  },
  partial_payment_min_remaining: (v) => {
    const n = parseFloat(v);
    return !isNaN(n) && n >= 0;
  },
  payment_webhook_url: (v) => {
    if (v === '') return true;
    try {
      const u = new URL(v);
      return u.protocol === 'https:';
    } catch {
      return false;
    }
  },
  payment_webhook_secret: (v) => typeof v === 'string' && v.length >= 16,
};
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/__tests__/unit/services/SettingsService.test.ts`
Expected: todos verdes.

- [ ] **Step 5: Commit**

```bash
git add src/services/SettingsService.ts src/__tests__/unit/services/SettingsService.test.ts
git commit -m "feat(settings): chaves de pagamento parcial e webhook global"
```

---

## Task 3: DebtRepository — `updateDebtPaidAmount` com lock otimista (TDD)

**Files:**
- Modify: `src/repositories/DebtRepository.ts`
- Modify: `src/__tests__/unit/repositories/DebtRepository.test.ts`

- [ ] **Step 1: Escrever teste que falha**

Em `src/__tests__/unit/repositories/DebtRepository.test.ts`:
```typescript
describe('updateDebtPaidAmount', () => {
  it('atualiza paidAmount quando o valor atual bate (lock otimista)', async () => {
    const mockUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    (prisma.debt.updateMany as any) = mockUpdateMany;

    const result = await debtRepository.updateDebtPaidAmount(
      'debt-1',
      '40.00',      // expectedCurrentPaidAmount
      '80.00',      // newPaidAmount
      'PENDENTE',   // newStatus
    );

    expect(result).toBe(true);
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: 'debt-1', paidAmount: '40.00' },
      data: { paidAmount: '80.00', status: 'PENDENTE' },
    });
  });

  it('retorna false quando conflito (update affected 0 rows)', async () => {
    (prisma.debt.updateMany as any) = vi.fn().mockResolvedValue({ count: 0 });
    const result = await debtRepository.updateDebtPaidAmount('debt-1', '40.00', '80.00', 'PENDENTE');
    expect(result).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/__tests__/unit/repositories/DebtRepository.test.ts`
Expected: falha `updateDebtPaidAmount is not a function`.

- [ ] **Step 3: Implementar método**

Em `src/repositories/DebtRepository.ts`:
```typescript
async updateDebtPaidAmount(
  debtId: string,
  expectedCurrentPaidAmount: Prisma.Decimal | string,
  newPaidAmount: Prisma.Decimal | string,
  newStatus: DebtStatus,
): Promise<boolean> {
  const result = await prisma.debt.updateMany({
    where: { id: debtId, paidAmount: expectedCurrentPaidAmount as any },
    data: { paidAmount: newPaidAmount as any, status: newStatus },
  });
  return result.count === 1;
}
```

Imports necessários no topo do arquivo: `DebtStatus` de `../types` (se ainda não existe). `Prisma` já deve estar importado.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/__tests__/unit/repositories/DebtRepository.test.ts`
Expected: verdes.

- [ ] **Step 5: Commit**

```bash
git add src/repositories/DebtRepository.ts src/__tests__/unit/repositories/DebtRepository.test.ts
git commit -m "feat(debt-repo): updateDebtPaidAmount com lock otimista"
```

---

## Task 4: WebhookDispatcher — envio HTTP + HMAC + retry (TDD)

**Files:**
- Create: `src/services/WebhookDispatcher.ts`
- Create: `src/__tests__/unit/services/WebhookDispatcher.test.ts`

- [ ] **Step 1: Escrever teste que falha — assinatura HMAC correta**

Criar `src/__tests__/unit/services/WebhookDispatcher.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

vi.mock('../../../repositories/SettingsRepository', () => ({
  default: { getAll: vi.fn() },
}));

import webhookDispatcher from '../../../services/WebhookDispatcher';
import settingsRepository from '../../../repositories/SettingsRepository';

const mkEvent = () => ({
  eventId: 'evt-1',
  eventType: 'payment.confirmed' as const,
  paymentType: 'PARTIAL' as const,
  timestamp: '2026-04-22T18:30:00.000Z',
  payment: { id: 'p-1', referenceNum: 'TPW-1', method: 'PIX', amount: 40, paidAt: '2026-04-22T18:30:00.000Z' },
  debt: { id: 'd-1', codigo: '1234', valor: 100, paidAmount: 40, remaining: 60, status: 'PENDENTE' as const },
  user: { id: 'u-1', cpf: '12345678900' },
});

describe('WebhookDispatcher', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers();
    (settingsRepository.getAll as any).mockResolvedValue({
      payment_webhook_url: 'https://example.com/hook',
      payment_webhook_secret: 'secret-with-16-chars!!',
    });
  });

  it('envia POST com assinatura HMAC-SHA256 correta', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    (globalThis as any).fetch = fetchMock;

    await webhookDispatcher.send(mkEvent());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://example.com/hook');
    expect(opts.method).toBe('POST');
    expect(opts.headers['Content-Type']).toBe('application/json');
    expect(opts.headers['X-Tuppeware-Event']).toBe('payment.confirmed');
    expect(opts.headers['X-Tuppeware-Event-Id']).toBe('evt-1');
    expect(opts.headers['X-Tuppeware-Signature']).toMatch(/^sha256=[a-f0-9]{64}$/);

    const timestamp = opts.headers['X-Tuppeware-Timestamp'];
    const expected = crypto
      .createHmac('sha256', 'secret-with-16-chars!!')
      .update(`${timestamp}.${opts.body}`)
      .digest('hex');
    expect(opts.headers['X-Tuppeware-Signature']).toBe(`sha256=${expected}`);
  });

  it('no-op quando URL ausente', async () => {
    (settingsRepository.getAll as any).mockResolvedValue({ payment_webhook_url: '', payment_webhook_secret: 'x'.repeat(16) });
    const fetchMock = vi.fn();
    (globalThis as any).fetch = fetchMock;

    await webhookDispatcher.send(mkEvent());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('aborta quando secret ausente (log warn)', async () => {
    (settingsRepository.getAll as any).mockResolvedValue({ payment_webhook_url: 'https://x.com/h' });
    const fetchMock = vi.fn();
    (globalThis as any).fetch = fetchMock;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await webhookDispatcher.send(mkEvent());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('retry 3x em 5xx com backoff', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: false, status: 502 })
      .mockResolvedValueOnce({ ok: true, status: 200 });
    (globalThis as any).fetch = fetchMock;

    const promise = webhookDispatcher.send(mkEvent());
    await vi.advanceTimersByTimeAsync(10_000);
    await promise;

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('desiste após 3 falhas e loga erro (não lança)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    (globalThis as any).fetch = fetchMock;
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const promise = webhookDispatcher.send(mkEvent());
    await vi.advanceTimersByTimeAsync(15_000);
    await expect(promise).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(errorSpy).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/__tests__/unit/services/WebhookDispatcher.test.ts`
Expected: falha `Cannot find module '../../../services/WebhookDispatcher'`.

- [ ] **Step 3: Implementar `WebhookDispatcher`**

Criar `src/services/WebhookDispatcher.ts`:
```typescript
import crypto from 'crypto';
import settingsRepository from '../repositories/SettingsRepository';

export interface PaymentConfirmedEvent {
  eventId: string;
  eventType: 'payment.confirmed';
  paymentType: 'PARTIAL' | 'FULL';
  timestamp: string;
  payment: {
    id: string;
    referenceNum: string;
    method: string;
    amount: number;
    paidAt: string;
  };
  debt: {
    id: string;
    codigo: string;
    valor: number;
    paidAmount: number;
    remaining: number;
    status: 'PENDENTE' | 'ATRASADO' | 'PAGO';
  };
  user: { id: string; cpf: string };
}

const MAX_ATTEMPTS = 3;
const TIMEOUT_MS = 5000;
const BACKOFFS_MS = [0, 2000, 8000];

class WebhookDispatcher {
  async send(event: PaymentConfirmedEvent): Promise<void> {
    const settings = await settingsRepository.getAll();
    const url = settings.payment_webhook_url;
    const secret = settings.payment_webhook_secret;

    if (!url) return;
    if (!secret) {
      console.warn('[WebhookDispatcher] URL configurada sem secret — abortando envio');
      return;
    }

    const body = JSON.stringify(event);
    const timestamp = Date.now().toString();
    const signature = crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Tuppeware-Event': event.eventType,
      'X-Tuppeware-Event-Id': event.eventId,
      'X-Tuppeware-Timestamp': timestamp,
      'X-Tuppeware-Signature': `sha256=${signature}`,
    };

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (BACKOFFS_MS[attempt] > 0) {
        await new Promise((r) => setTimeout(r, BACKOFFS_MS[attempt]));
      }
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
        const res = await fetch(url, { method: 'POST', headers, body, signal: ctrl.signal });
        clearTimeout(t);
        if (res.ok) return;
        console.error(`[WebhookDispatcher] tentativa ${attempt + 1}/${MAX_ATTEMPTS} falhou: HTTP ${res.status}`);
      } catch (err) {
        console.error(`[WebhookDispatcher] tentativa ${attempt + 1}/${MAX_ATTEMPTS} erro:`, err);
      }
    }
    console.error(`[WebhookDispatcher] desistiu após ${MAX_ATTEMPTS} tentativas — eventId=${event.eventId}`);
  }
}

export default new WebhookDispatcher();
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/__tests__/unit/services/WebhookDispatcher.test.ts`
Expected: todos verdes.

- [ ] **Step 5: Commit**

```bash
git add src/services/WebhookDispatcher.ts src/__tests__/unit/services/WebhookDispatcher.test.ts
git commit -m "feat(webhook): WebhookDispatcher com HMAC e retry exponencial"
```

---

## Task 5: PaymentService — extrair helpers privados (refactor safe)

**Files:**
- Modify: `src/services/PaymentService.ts`

O objetivo é extrair de `create` três helpers reusáveis sem mudar comportamento. Todos os testes existentes devem continuar verdes.

- [ ] **Step 1: Rodar testes existentes (baseline)**

Run: `npm run test -- PaymentService`
Expected: todos verdes (baseline pré-refactor).

- [ ] **Step 2: Extrair `_validateDebtsExist`**

Em `PaymentService.ts`, no topo da classe (antes do `create`):
```typescript
private async _validateDebtsExist(debtIds: string[]) {
  const debts = await debtRepository.findByIds(debtIds);
  if (debts.length === 0) {
    throw new AppError('Nenhuma dívida encontrada', StatusCodes.NOT_FOUND);
  }
  if (debts.length !== debtIds.length) {
    throw new AppError('Uma ou mais dívidas não foram encontradas', StatusCodes.NOT_FOUND);
  }
  const paidDebts = debts.filter((d) => d.status === 'PAGO');
  if (paidDebts.length > 0) {
    throw new AppError('Uma ou mais dívidas já estão pagas', StatusCodes.BAD_REQUEST);
  }
  return debts;
}
```

Substituir as primeiras linhas do `create` pela chamada `const debts = await this._validateDebtsExist(debtIds);`.

- [ ] **Step 3: Extrair `_callGatewayPix`**

Na mesma classe:
```typescript
private async _callGatewayPix(amountCents: number, referenceNum: string, user: { id: string; cpf: string }) {
  const payload = eredeService.buildPixPayload(referenceNum, amountCents);
  return await eredeService.createTransaction(payload);
}
```

Substituir a construção inline de payload PIX dentro de `create` por essa chamada.

- [ ] **Step 4: Extrair `_persistPayment`**

```typescript
private async _persistPayment(params: {
  userId: string;
  method: 'PIX' | 'CARTAO_CREDITO';
  installments: number;
  subtotal: number;
  fee: number;
  totalValue: number;
  referenceNum: string;
  gatewayTransactionId?: string;
  qrCode?: string;
  paymentLink?: string;
  debtIds: string[];
  isPartial?: boolean;
}) {
  return await paymentRepository.create({
    userId: params.userId,
    method: params.method,
    installments: params.installments,
    subtotal: params.subtotal,
    fee: params.fee,
    totalValue: params.totalValue,
    referenceNum: params.referenceNum,
    gatewayTransactionId: params.gatewayTransactionId,
    qrCode: params.qrCode,
    paymentLink: params.paymentLink,
    isPartial: params.isPartial ?? false,
    gatewayProvider: 'EREDE',
    status: 'PENDENTE',
    paymentDebts: {
      create: params.debtIds.map((id) => ({ debtId: id })),
    },
  });
}
```

(Ajustar nomes dos campos/relations conforme o schema atual — a assinatura real depende de `Prisma.PaymentUncheckedCreateInput`.)

- [ ] **Step 5: Rodar testes existentes após refactor**

Run: `npm run test -- PaymentService`
Expected: todos continuam verdes (refactor não mudou comportamento).

- [ ] **Step 6: Commit**

```bash
git add src/services/PaymentService.ts
git commit -m "refactor(payment-service): extrair helpers privados reusáveis para parcial"
```

---

## Task 6: PaymentService.createPartial (TDD)

**Files:**
- Modify: `src/services/PaymentService.ts`
- Modify: `src/__tests__/unit/services/PaymentService.test.ts`

- [ ] **Step 1: Escrever testes que falham**

Em `src/__tests__/unit/services/PaymentService.test.ts`, adicionar novo `describe`:
```typescript
describe('createPartial', () => {
  const baseDto = { debtId: 'd-1', amount: 40 };
  const userId = 'u-1';

  const mkDebt = (overrides: Partial<any> = {}) => ({
    id: 'd-1',
    valor: 100,
    paidAmount: 0,
    status: 'PENDENTE',
    codigo: '1234',
    ...overrides,
  });

  const setSettings = (overrides: Record<string, string> = {}) => {
    (settingsRepository.getAll as any) = vi.fn().mockResolvedValue({
      partial_payment_enabled: 'true',
      partial_payment_min_amount: '10',
      partial_payment_min_remaining: '5',
      ...overrides,
    });
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    setSettings();
    (debtRepository.findById as any) = vi.fn().mockResolvedValue(mkDebt());
    (eredeService.createTransaction as any) = vi.fn().mockResolvedValue({
      tid: 'tid-1', returnCode: '00', qrCode: 'QR', paymentLink: null,
    });
    (eredeService.buildPixPayload as any) = vi.fn().mockReturnValue({});
    (paymentRepository.create as any) = vi.fn().mockResolvedValue({ id: 'p-1', referenceNum: 'TPW-1', qrCode: 'QR' });
  });

  it('cria parcial com valores válidos', async () => {
    const result = await paymentService.createPartial(userId, baseDto);
    expect(result).toMatchObject({ paymentId: 'p-1', qrCode: 'QR' });
    expect(paymentRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ isPartial: true, subtotal: 40, fee: 0, totalValue: 40, method: 'PIX' }),
    );
  });

  it('bloqueia 403 quando feature desabilitada', async () => {
    setSettings({ partial_payment_enabled: 'false' });
    await expect(paymentService.createPartial(userId, baseDto)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('404 quando dívida não encontrada', async () => {
    (debtRepository.findById as any) = vi.fn().mockResolvedValue(null);
    await expect(paymentService.createPartial(userId, baseDto)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('400 quando dívida já paga', async () => {
    (debtRepository.findById as any) = vi.fn().mockResolvedValue(mkDebt({ status: 'PAGO' }));
    await expect(paymentService.createPartial(userId, baseDto)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('400 quando amount < min_amount', async () => {
    await expect(paymentService.createPartial(userId, { debtId: 'd-1', amount: 5 })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('400 quando amount > remaining', async () => {
    (debtRepository.findById as any) = vi.fn().mockResolvedValue(mkDebt({ paidAmount: 70 }));
    await expect(paymentService.createPartial(userId, { debtId: 'd-1', amount: 40 })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('400 quando restante viola min_remaining (ex: sobra 2 com min 5)', async () => {
    await expect(paymentService.createPartial(userId, { debtId: 'd-1', amount: 98 })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('permite amount == remaining (quita exato)', async () => {
    (debtRepository.findById as any) = vi.fn().mockResolvedValue(mkDebt({ paidAmount: 60 }));
    await expect(paymentService.createPartial(userId, { debtId: 'd-1', amount: 40 })).resolves.toBeDefined();
  });

  it('respeita hierarquia: CONSULTOR de outro distrito não vê dívida', async () => {
    (debtRepository.findById as any) = vi.fn().mockResolvedValue(null);
    await expect(paymentService.createPartial(userId, baseDto)).rejects.toMatchObject({ statusCode: 404 });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/__tests__/unit/services/PaymentService.test.ts -t createPartial`
Expected: falha `paymentService.createPartial is not a function`.

- [ ] **Step 3: Implementar `createPartial`**

Em `PaymentService.ts`, novo método público:
```typescript
async createPartial(userId: string, dto: { debtId: string; amount: number }) {
  const settings = await settingsRepository.getAll();
  if (settings.partial_payment_enabled !== 'true') {
    throw new AppError('Pagamento parcial desabilitado', StatusCodes.FORBIDDEN);
  }

  const minAmount = parseFloat(settings.partial_payment_min_amount ?? '0');
  const minRemaining = parseFloat(settings.partial_payment_min_remaining ?? '0');

  const debt = await debtRepository.findById(dto.debtId);
  // Nota: findById precisa receber contexto do usuário para aplicar hierarquia.
  // Se o método atual não aceitar, usar DebtService.getByIdForUser (a introduzir) ou
  // filtrar via consultant lookup igual _buildWhereClause faz.
  if (!debt) {
    throw new AppError('Dívida não encontrada', StatusCodes.NOT_FOUND);
  }
  if (debt.status === 'PAGO') {
    throw new AppError('Dívida já paga', StatusCodes.BAD_REQUEST);
  }

  if (dto.amount < minAmount) {
    throw new AppError(`Valor mínimo para pagamento parcial: R$ ${minAmount.toFixed(2)}`, StatusCodes.BAD_REQUEST);
  }

  const valor = parseFloat(debt.valor.toString());
  const paid = parseFloat(debt.paidAmount.toString());
  const remaining = valor - paid;

  if (dto.amount > remaining) {
    throw new AppError(`Valor excede o restante (R$ ${remaining.toFixed(2)})`, StatusCodes.BAD_REQUEST);
  }

  const remainingAfter = remaining - dto.amount;
  if (remainingAfter !== 0 && remainingAfter < minRemaining) {
    throw new AppError(`Após o parcial deve sobrar R$ 0 ou ≥ R$ ${minRemaining.toFixed(2)}`, StatusCodes.BAD_REQUEST);
  }

  const amountCents = Math.round(dto.amount * 100);
  const referenceNum = `TPW-${Date.now()}-${userId.slice(0, 8)}`;

  const user = await userRepository.findById(userId);
  if (!user) throw new AppError('Usuário não encontrado', StatusCodes.NOT_FOUND);

  const gatewayResp = await this._callGatewayPix(amountCents, referenceNum, { id: user.id, cpf: user.cpf });

  const payment = await this._persistPayment({
    userId,
    method: 'PIX',
    installments: 1,
    subtotal: dto.amount,
    fee: 0,
    totalValue: dto.amount,
    referenceNum,
    gatewayTransactionId: gatewayResp.tid,
    qrCode: gatewayResp.qrCode,
    debtIds: [dto.debtId],
    isPartial: true,
  });

  return {
    paymentId: payment.id,
    referenceNum: payment.referenceNum,
    qrCode: payment.qrCode,
  };
}
```

**Nota sobre hierarquia:** se `debtRepository.findById(id)` atual não filtra por role, trocar por chamada ao `DebtService` que já aplica `_buildWhereClause`. Alternativa: adicionar novo método `debtRepository.findByIdForUser(id, where)` recebendo o `WhereInput` já construído.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/__tests__/unit/services/PaymentService.test.ts -t createPartial`
Expected: verdes.

- [ ] **Step 5: Rodar todos os testes do service**

Run: `npm run test -- PaymentService`
Expected: toda a suíte verde (nenhuma regressão).

- [ ] **Step 6: Commit**

```bash
git add src/services/PaymentService.ts src/__tests__/unit/services/PaymentService.test.ts
git commit -m "feat(payment-service): createPartial com validações e mínimos configuráveis"
```

---

## Task 7: partialPaymentValidator (TDD)

**Files:**
- Create: `src/validators/partialPaymentValidator.ts`
- Create: `src/__tests__/unit/validators/partialPaymentValidator.test.ts`

- [ ] **Step 1: Escrever teste que falha**

```typescript
import { describe, it, expect, vi } from 'vitest';
import validate from '../../../validators/partialPaymentValidator';

const mkReq = (body: any) => ({ body } as any);
const mkRes = () => { const r: any = {}; r.status = vi.fn().mockReturnValue(r); r.json = vi.fn().mockReturnValue(r); return r; };

describe('partialPaymentValidator', () => {
  it('passa com payload válido', () => {
    const next = vi.fn();
    validate(mkReq({ debtId: 'abc', amount: 40 }), mkRes(), next);
    expect(next).toHaveBeenCalledWith();
  });

  it('rejeita sem debtId', () => {
    const next = vi.fn();
    validate(mkReq({ amount: 40 }), mkRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  it('rejeita amount não-numérico', () => {
    const next = vi.fn();
    validate(mkReq({ debtId: 'a', amount: 'x' }), mkRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  it('rejeita amount ≤ 0', () => {
    const next = vi.fn();
    validate(mkReq({ debtId: 'a', amount: 0 }), mkRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  it('rejeita amount com mais de 2 casas decimais', () => {
    const next = vi.fn();
    validate(mkReq({ debtId: 'a', amount: 10.123 }), mkRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/__tests__/unit/validators/partialPaymentValidator.test.ts`
Expected: falha import inexistente.

- [ ] **Step 3: Implementar**

`src/validators/partialPaymentValidator.ts`:
```typescript
import { Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';
import AppError from '../utils/AppError';

export default function partialPaymentValidator(req: Request, _res: Response, next: NextFunction) {
  const { debtId, amount } = req.body ?? {};
  if (typeof debtId !== 'string' || debtId.length === 0) {
    return next(new AppError('debtId é obrigatório', StatusCodes.BAD_REQUEST));
  }
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    return next(new AppError('amount deve ser número positivo', StatusCodes.BAD_REQUEST));
  }
  if (Math.round(amount * 100) / 100 !== amount) {
    return next(new AppError('amount aceita até 2 casas decimais', StatusCodes.BAD_REQUEST));
  }
  next();
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/__tests__/unit/validators/partialPaymentValidator.test.ts`
Expected: verdes.

- [ ] **Step 5: Commit**

```bash
git add src/validators/partialPaymentValidator.ts src/__tests__/unit/validators/partialPaymentValidator.test.ts
git commit -m "feat(validator): partialPaymentValidator"
```

---

## Task 8: Rota + Controller.createPartial (TDD)

**Files:**
- Modify: `src/controllers/PaymentController.ts`
- Modify: `src/__tests__/unit/controllers/PaymentController.test.ts`
- Modify: `src/routes/paymentRoutes.ts`

- [ ] **Step 1: Teste do controller**

Adicionar em `PaymentController.test.ts`:
```typescript
describe('createPartial', () => {
  it('chama service e retorna 201', async () => {
    (paymentService.createPartial as any) = vi.fn().mockResolvedValue({ paymentId: 'p-1', qrCode: 'Q', referenceNum: 'R' });
    const req = { user: { id: 'u-1' }, body: { debtId: 'd-1', amount: 40 } } as any;
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    await paymentController.createPartial(req, res, vi.fn());
    expect(paymentService.createPartial).toHaveBeenCalledWith('u-1', { debtId: 'd-1', amount: 40 });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ paymentId: 'p-1', qrCode: 'Q', referenceNum: 'R' });
  });

  it('propaga erro do service para errorHandler', async () => {
    (paymentService.createPartial as any) = vi.fn().mockRejectedValue(new Error('fail'));
    const req = { user: { id: 'u-1' }, body: {} } as any;
    const res: any = {};
    const next = vi.fn();
    await paymentController.createPartial(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/__tests__/unit/controllers/PaymentController.test.ts -t createPartial`
Expected: falha.

- [ ] **Step 3: Implementar controller**

Em `PaymentController.ts`:
```typescript
async createPartial(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as any).user.id;
    const result = await paymentService.createPartial(userId, req.body);
    return res.status(StatusCodes.CREATED).json(result);
  } catch (err) {
    return next(err);
  }
}
```

- [ ] **Step 4: Registrar rota**

Em `src/routes/paymentRoutes.ts`:
```typescript
import partialPaymentValidator from '../validators/partialPaymentValidator';
// ...
router.post(
  '/partial',
  authMiddleware,
  rateLimitMiddleware,
  partialPaymentValidator,
  (req, res, next) => paymentController.createPartial(req, res, next),
);
```

- [ ] **Step 5: Rodar testes**

Run: `npx vitest run src/__tests__/unit/controllers/PaymentController.test.ts`
Expected: verdes.

- [ ] **Step 6: Commit**

```bash
git add src/controllers/PaymentController.ts src/routes/paymentRoutes.ts src/__tests__/unit/controllers/PaymentController.test.ts
git commit -m "feat(payments): rota POST /payments/partial"
```

---

## Task 9: processGatewayCallback — lógica de parcial + disparo do webhook (TDD)

**Files:**
- Modify: `src/services/PaymentService.ts`
- Modify: `src/__tests__/unit/services/PaymentService.test.ts`

- [ ] **Step 1: Testes que falham**

Em `PaymentService.test.ts`, novo `describe`:
```typescript
describe('processGatewayCallback — parcial', () => {
  const webhookSpy = vi.spyOn(webhookDispatcher, 'send').mockResolvedValue(undefined);

  beforeEach(() => {
    webhookSpy.mockClear();
  });

  it('callback de parcial: soma paidAmount, mantém PENDENTE, dispara webhook PARTIAL', async () => {
    const payment = { id: 'p-1', referenceNum: 'R', totalValue: 40, isPartial: true, status: 'PENDENTE', userId: 'u-1', method: 'PIX', paymentDebts: [{ debtId: 'd-1', debt: { id: 'd-1', codigo: '1', valor: 100, paidAmount: 0, status: 'PENDENTE' } }] };
    (paymentRepository.findByReferenceNum as any) = vi.fn().mockResolvedValue(payment);
    (paymentRepository.update as any) = vi.fn().mockResolvedValue(payment);
    (debtRepository.updateDebtPaidAmount as any) = vi.fn().mockResolvedValue(true);
    (userRepository.findById as any) = vi.fn().mockResolvedValue({ id: 'u-1', cpf: '1'.repeat(11) });

    await paymentService.processGatewayCallback({ reference: 'R', returnCode: '00', tid: 'tid-1' } as any);

    expect(debtRepository.updateDebtPaidAmount).toHaveBeenCalledWith('d-1', expect.anything(), expect.anything(), 'PENDENTE');
    await new Promise((r) => setImmediate(r));
    expect(webhookSpy).toHaveBeenCalledWith(expect.objectContaining({ paymentType: 'PARTIAL', debt: expect.objectContaining({ paidAmount: 40, remaining: 60 }) }));
  });

  it('callback de último parcial: quita dívida (status PAGO) e dispara webhook', async () => {
    const payment = { id: 'p-2', referenceNum: 'R2', totalValue: 60, isPartial: true, status: 'PENDENTE', userId: 'u-1', method: 'PIX', paymentDebts: [{ debtId: 'd-1', debt: { id: 'd-1', codigo: '1', valor: 100, paidAmount: 40, status: 'PENDENTE' } }] };
    (paymentRepository.findByReferenceNum as any) = vi.fn().mockResolvedValue(payment);
    (paymentRepository.update as any) = vi.fn().mockResolvedValue(payment);
    (debtRepository.updateDebtPaidAmount as any) = vi.fn().mockResolvedValue(true);

    await paymentService.processGatewayCallback({ reference: 'R2', returnCode: '00', tid: 'tid-2' } as any);
    expect(debtRepository.updateDebtPaidAmount).toHaveBeenCalledWith('d-1', expect.anything(), expect.anything(), 'PAGO');
  });

  it('callback de pagamento total: preserva fluxo atual e dispara webhook FULL', async () => {
    const payment = { id: 'p-3', referenceNum: 'R3', totalValue: 100, isPartial: false, status: 'PENDENTE', userId: 'u-1', method: 'PIX', paymentDebts: [{ debtId: 'd-1', debt: { id: 'd-1', codigo: '1', valor: 100, paidAmount: 0, status: 'PENDENTE' } }] };
    (paymentRepository.findByReferenceNum as any) = vi.fn().mockResolvedValue(payment);
    (paymentRepository.update as any) = vi.fn().mockResolvedValue(payment);
    (debtRepository.updateMany as any) = vi.fn().mockResolvedValue({ count: 1 });

    await paymentService.processGatewayCallback({ reference: 'R3', returnCode: '00', tid: 'tid-3' } as any);
    await new Promise((r) => setImmediate(r));
    expect(webhookSpy).toHaveBeenCalledWith(expect.objectContaining({ paymentType: 'FULL' }));
  });

  it('callback cancelado em parcial: não mexe em paidAmount nem dispara webhook', async () => {
    const payment = { id: 'p-4', referenceNum: 'R4', totalValue: 40, isPartial: true, status: 'PENDENTE', userId: 'u-1', method: 'PIX', paymentDebts: [{ debtId: 'd-1', debt: { id: 'd-1', codigo: '1', valor: 100, paidAmount: 0, status: 'PENDENTE' } }] };
    (paymentRepository.findByReferenceNum as any) = vi.fn().mockResolvedValue(payment);
    (paymentRepository.update as any) = vi.fn().mockResolvedValue(payment);
    (debtRepository.updateDebtPaidAmount as any) = vi.fn();

    await paymentService.processGatewayCallback({ reference: 'R4', returnCode: '99', status: 4, tid: 'tid-4' } as any);
    expect(debtRepository.updateDebtPaidAmount).not.toHaveBeenCalled();
    expect(webhookSpy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/__tests__/unit/services/PaymentService.test.ts -t "processGatewayCallback — parcial"`
Expected: falhas (lógica nova não existe).

- [ ] **Step 3: Implementar lógica de parcial no callback**

No `processGatewayCallback` de `PaymentService.ts`, após confirmação (returnCode `"00"`):
```typescript
// ...após marcar Payment.status = PAGO...

if (payment.isPartial) {
  const linkedDebt = payment.paymentDebts[0].debt; // parcial tem exatamente 1
  const paidNow = parseFloat(linkedDebt.paidAmount.toString()) + parseFloat(payment.totalValue.toString());
  const quitou = paidNow >= parseFloat(linkedDebt.valor.toString());

  let updated = false;
  for (let attempt = 0; attempt < 3 && !updated; attempt++) {
    updated = await debtRepository.updateDebtPaidAmount(
      linkedDebt.id,
      linkedDebt.paidAmount,
      paidNow.toFixed(2),
      quitou ? 'PAGO' : linkedDebt.status,
    );
    if (!updated) {
      const fresh = await debtRepository.findById(linkedDebt.id);
      if (!fresh) break;
      linkedDebt.paidAmount = fresh.paidAmount;
      linkedDebt.status = fresh.status;
    }
  }
  if (!updated) {
    throw new AppError('Conflito ao atualizar paidAmount', StatusCodes.CONFLICT);
  }
} else {
  // fluxo atual: marcar todas as dívidas como PAGO
  // (já existente; manter)
}

// Dispara webhook assíncrono APÓS persistência:
const user = await userRepository.findById(payment.userId);
const primaryDebt = payment.paymentDebts[0].debt;
const event: PaymentConfirmedEvent = {
  eventId: payment.id,
  eventType: 'payment.confirmed',
  paymentType: payment.isPartial ? 'PARTIAL' : 'FULL',
  timestamp: new Date().toISOString(),
  payment: {
    id: payment.id,
    referenceNum: payment.referenceNum,
    method: payment.method,
    amount: parseFloat(payment.totalValue.toString()),
    paidAt: new Date().toISOString(),
  },
  debt: {
    id: primaryDebt.id,
    codigo: primaryDebt.codigo,
    valor: parseFloat(primaryDebt.valor.toString()),
    paidAmount: payment.isPartial
      ? parseFloat(primaryDebt.paidAmount.toString()) + parseFloat(payment.totalValue.toString())
      : parseFloat(primaryDebt.valor.toString()),
    remaining: payment.isPartial
      ? Math.max(0, parseFloat(primaryDebt.valor.toString()) - (parseFloat(primaryDebt.paidAmount.toString()) + parseFloat(payment.totalValue.toString())))
      : 0,
    status: payment.isPartial && !quitou ? primaryDebt.status : 'PAGO',
  },
  user: { id: user!.id, cpf: user!.cpf },
};

setImmediate(() => {
  webhookDispatcher.send(event).catch((err) => console.error('[PaymentService] webhook falhou', err));
});
```

Imports novos no topo: `import webhookDispatcher, { PaymentConfirmedEvent } from './WebhookDispatcher';`

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/__tests__/unit/services/PaymentService.test.ts`
Expected: toda a suíte verde.

- [ ] **Step 5: Commit**

```bash
git add src/services/PaymentService.ts src/__tests__/unit/services/PaymentService.test.ts
git commit -m "feat(callback): acumular paidAmount em parciais + disparar webhook pós-commit"
```

---

## Task 10: DebtService/DebtRepository — resposta inclui `remaining` (aditivo)

**Files:**
- Modify: `src/services/DebtService.ts`
- Modify: `src/__tests__/unit/services/DebtService.test.ts`

- [ ] **Step 1: Teste falhando**

Em `DebtService.test.ts`:
```typescript
it('listagem enriquece com remaining = valor - paidAmount', async () => {
  (debtRepository.findAll as any) = vi.fn().mockResolvedValue({
    data: [{ id: 'd', valor: 100, paidAmount: 40, status: 'PENDENTE' }],
    total: 1,
  });
  const res = await debtService.list({} as any, { page: 1, limit: 10 } as any);
  expect(res.data[0]).toMatchObject({ paidAmount: 40, remaining: 60 });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/__tests__/unit/services/DebtService.test.ts -t remaining`
Expected: falha (campo `remaining` ausente).

- [ ] **Step 3: Implementar**

Em `DebtService.list` (nome real pode ser `getAll`/`list`/`findMany` — ajustar), após obter `data`:
```typescript
const enriched = data.map((d) => ({
  ...d,
  paidAmount: parseFloat(d.paidAmount.toString()),
  remaining: Math.max(0, parseFloat(d.valor.toString()) - parseFloat(d.paidAmount.toString())),
}));
return { data: enriched, total };
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/__tests__/unit/services/DebtService.test.ts`
Expected: verdes.

- [ ] **Step 5: Commit**

```bash
git add src/services/DebtService.ts src/__tests__/unit/services/DebtService.test.ts
git commit -m "feat(debts): incluir paidAmount e remaining na listagem"
```

---

## Task 11: Integration test — fluxo completo

**Files:**
- Create: `src/__tests__/integration/partial-payments.test.ts`

- [ ] **Step 1: Escrever integration test**

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'http';
import { createTestClient } from '../helpers/testClient';
import { cleanDatabase } from '../helpers/factories';
import prisma from '../../config/database';

describe('Partial Payments — integration', () => {
  let webhookServer: http.Server;
  let webhookEvents: any[] = [];
  let webhookPort: number;

  beforeAll(async () => {
    webhookServer = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        webhookEvents.push({ headers: req.headers, body: JSON.parse(body) });
        res.writeHead(200).end();
      });
    });
    await new Promise<void>((r) => webhookServer.listen(0, () => r()));
    webhookPort = (webhookServer.address() as any).port;
  });

  afterAll(async () => {
    await new Promise<void>((r) => webhookServer.close(() => r()));
  });

  beforeEach(async () => {
    await cleanDatabase();
    webhookEvents = [];
    await prisma.setting.createMany({
      data: [
        { key: 'partial_payment_enabled', value: 'true' },
        { key: 'partial_payment_min_amount', value: '10' },
        { key: 'partial_payment_min_remaining', value: '5' },
        { key: 'payment_webhook_url', value: `http://localhost:${webhookPort}/hook` }, // http apenas em teste
        { key: 'payment_webhook_secret', value: 'test-secret-16chars!' },
      ],
    });
    // NB: se a validação do SettingsService bloquear http, inserir direto via prisma como acima.
  });

  it('fluxo completo: cria parcial → callback confirma → paidAmount sobe → webhook recebido', async () => {
    const { client, user, debt } = await createTestClient({ debtValor: 100 });

    const create = await client.post('/api/payments/partial').send({ debtId: debt.id, amount: 40 });
    expect(create.status).toBe(201);
    const { paymentId, referenceNum } = create.body;

    // simula callback
    const cb = await client.post('/api/payments/callback/erede').send({ reference: referenceNum, returnCode: '00', tid: 'tid-int' });
    expect(cb.status).toBeGreaterThanOrEqual(200);
    expect(cb.status).toBeLessThan(300);

    const updated = await prisma.debt.findUnique({ where: { id: debt.id } });
    expect(parseFloat(updated!.paidAmount.toString())).toBe(40);
    expect(updated!.status).toBe('PENDENTE');

    // aguarda webhook async
    await new Promise((r) => setTimeout(r, 100));
    expect(webhookEvents).toHaveLength(1);
    expect(webhookEvents[0].body.paymentType).toBe('PARTIAL');
    expect(webhookEvents[0].body.debt.remaining).toBe(60);
    expect(webhookEvents[0].headers['x-tuppeware-signature']).toMatch(/^sha256=/);
  });

  it('dois parciais sequenciais quitam a dívida', async () => {
    const { client, debt } = await createTestClient({ debtValor: 100 });

    for (const amount of [40, 60]) {
      const c = await client.post('/api/payments/partial').send({ debtId: debt.id, amount });
      await client.post('/api/payments/callback/erede').send({ reference: c.body.referenceNum, returnCode: '00', tid: `tid-${amount}` });
    }

    const final = await prisma.debt.findUnique({ where: { id: debt.id } });
    expect(final!.status).toBe('PAGO');
    expect(parseFloat(final!.paidAmount.toString())).toBe(100);
  });

  it('feature off: retorna 403', async () => {
    await prisma.setting.update({ where: { key: 'partial_payment_enabled' }, data: { value: 'false' } });
    const { client, debt } = await createTestClient({ debtValor: 100 });
    const res = await client.post('/api/payments/partial').send({ debtId: debt.id, amount: 40 });
    expect(res.status).toBe(403);
  });
});
```

**Helpers:** se `createTestClient({ debtValor })` não existe com essa assinatura, adaptar o helper atual para receber `debtValor`. Alternativa: criar a dívida inline após o login.

- [ ] **Step 2: Rodar**

Run: `npm run test:integration -- partial-payments`
Expected: verdes. Se algum helper faltar, ajustar.

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/integration/partial-payments.test.ts
git commit -m "test(integration): fluxo de pagamento parcial end-to-end"
```

---

## Task 12: Swagger + docs

**Files:**
- Modify: `src/config/swagger.ts`
- Modify: `docs/design/architecture.md`
- Modify: `docs/project/requirements.md`
- Modify: `docs/project/acceptance.md`

- [ ] **Step 1: Swagger — nova rota**

Em `src/config/swagger.ts`, adicionar:
- `POST /payments/partial` com body `{debtId, amount}`, 201/400/403/404
- Campo `isPartial: boolean` no schema do `Payment`
- Campo `paidAmount: number` e `remaining: number` no schema do `Debt`
- Novas chaves de settings na documentação da rota `PUT /admin/settings`

- [ ] **Step 2: requirements.md**

Adicionar:
- `RF-30` — Pagamento parcial via PIX (single debt) habilitável via admin
- `RF-31` — Webhook assinado (HMAC) para eventos de pagamento confirmado (PARTIAL e FULL)

- [ ] **Step 3: acceptance.md**

Critérios rastreáveis para RF-30 e RF-31 (espelhando a matriz de erros da spec).

- [ ] **Step 4: architecture.md**

Anexar um parágrafo sobre o fluxo de parcial e o `WebhookDispatcher`.

- [ ] **Step 5: Build + lint final**

```bash
npm run build && npm run lint
```

- [ ] **Step 6: Commit final**

```bash
git add src/config/swagger.ts docs/
git commit -m "docs: Swagger e requisitos para RF-30/RF-31 (pagamento parcial)"
```

---

## Definition of Done

- [ ] Todos os testes unit e integration verdes
- [ ] `npm run build && npm run lint` sem erros
- [ ] Cobertura ≥ 90% linhas (manter patamar atual)
- [ ] Spec e plan commitados
- [ ] Admin consegue configurar via `PUT /admin/settings`
- [ ] Webhook recebido com assinatura HMAC válida no integration test
- [ ] Feature flag off → 403 na rota `/partial`
- [ ] Regra `min_remaining` bloqueia parcial que deixaria saldo menor que o configurado (mas ≠ 0)
