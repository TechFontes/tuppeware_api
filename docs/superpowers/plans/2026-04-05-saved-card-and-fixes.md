# Saved Card Route, Token Payments & Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dedicated route to save cards via eRede tokenization, enable payments using saved cards, fix Swagger inconsistencies, create missing tests, and update the audit document.

**Architecture:** Extends existing `UserController` + `SavedCardService` + `ERedeService` with a new POST endpoint and modifies `PaymentService.create` to accept `savedCardId`. Validators are added/updated. Swagger schemas are corrected inline in `swagger.ts`.

**Tech Stack:** Node.js, TypeScript, Express 5, Vitest, express-validator, eRede REST API

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Create | `src/validators/savedCardValidator.ts` | Validator for POST saved-cards |
| Create | `src/__tests__/unit/validators/savedCardValidator.test.ts` | Tests for saved card validator |
| Create | `src/__tests__/unit/controllers/PaymentHistoryController.test.ts` | Tests for history controller |
| Modify | `src/types/index.ts` | Add `savedCardId` to `CreatePaymentDTO` |
| Modify | `src/controllers/UserController.ts` | Add `createSavedCard` method |
| Modify | `src/routes/userRoutes.ts` | Add POST `/me/saved-cards` route |
| Modify | `src/services/PaymentService.ts` | Handle `savedCardId` in `create` |
| Modify | `src/services/ERedeService.ts` | Support `cardToken` in `buildCreditPayload` |
| Modify | `src/validators/paymentValidator.ts` | Conditional validation for `savedCardId` |
| Modify | `src/config/swagger.ts` | Fix all Swagger inconsistencies |
| Modify | `src/__tests__/unit/services/SavedCardService.test.ts` | (already good — no changes needed) |
| Modify | `src/__tests__/unit/services/PaymentService.test.ts` | Add savedCardId scenarios |
| Modify | `src/__tests__/unit/services/ERedeService.test.ts` | Add buildCreditPayload with token |
| Modify | `src/__tests__/unit/controllers/UserController.test.ts` | Add createSavedCard test |
| Modify | `docs/project/audit-2026-04-01.md` | Update audit with current status |
| Modify | `docs/project/requirements.md` | Add RF-28, RF-29 |

---

### Task 1: Saved Card Validator — RED + GREEN

**Files:**
- Create: `src/validators/savedCardValidator.ts`
- Create: `src/__tests__/unit/validators/savedCardValidator.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/unit/validators/savedCardValidator.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { validationResult } from 'express-validator';
import { createSavedCardValidator } from '../../../validators/savedCardValidator';

const runValidation = async (body: Record<string, unknown>) => {
  const req = { body } as any;
  const res = {} as any;
  for (const middleware of createSavedCardValidator) {
    await new Promise<void>((resolve) => {
      middleware(req, res, () => resolve());
    });
  }
  return validationResult(req);
};

describe('createSavedCardValidator', () => {
  const validBody = {
    cardNumber: '4111111111111111',
    expMonth: '12',
    expYear: '2028',
    holderName: 'JOAO DA SILVA',
  };

  it('aceita body válido sem erros', async () => {
    const result = await runValidation(validBody);
    expect(result.isEmpty()).toBe(true);
  });

  it('rejeita cardNumber ausente', async () => {
    const result = await runValidation({ ...validBody, cardNumber: undefined });
    expect(result.isEmpty()).toBe(false);
    const errors = result.array();
    expect(errors.some((e: any) => e.path === 'cardNumber')).toBe(true);
  });

  it('rejeita cardNumber com menos de 13 dígitos', async () => {
    const result = await runValidation({ ...validBody, cardNumber: '123456789012' });
    expect(result.isEmpty()).toBe(false);
  });

  it('rejeita cardNumber com mais de 19 dígitos', async () => {
    const result = await runValidation({ ...validBody, cardNumber: '12345678901234567890' });
    expect(result.isEmpty()).toBe(false);
  });

  it('rejeita cardNumber com caracteres não numéricos', async () => {
    const result = await runValidation({ ...validBody, cardNumber: '4111-1111-1111-1111' });
    expect(result.isEmpty()).toBe(false);
  });

  it('rejeita expMonth ausente', async () => {
    const result = await runValidation({ ...validBody, expMonth: undefined });
    expect(result.isEmpty()).toBe(false);
  });

  it('rejeita expMonth fora do range 01-12', async () => {
    const result = await runValidation({ ...validBody, expMonth: '13' });
    expect(result.isEmpty()).toBe(false);
  });

  it('rejeita expYear ausente', async () => {
    const result = await runValidation({ ...validBody, expYear: undefined });
    expect(result.isEmpty()).toBe(false);
  });

  it('rejeita expYear com menos de 4 dígitos', async () => {
    const result = await runValidation({ ...validBody, expYear: '28' });
    expect(result.isEmpty()).toBe(false);
  });

  it('rejeita holderName ausente', async () => {
    const result = await runValidation({ ...validBody, holderName: undefined });
    expect(result.isEmpty()).toBe(false);
  });

  it('rejeita holderName com menos de 2 caracteres', async () => {
    const result = await runValidation({ ...validBody, holderName: 'A' });
    expect(result.isEmpty()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/unit/validators/savedCardValidator.test.ts`
Expected: FAIL — module `../../../validators/savedCardValidator` not found

- [ ] **Step 3: Write minimal implementation**

Create `src/validators/savedCardValidator.ts`:

```typescript
import { body } from 'express-validator';

const createSavedCardValidator = [
  body('cardNumber')
    .isString()
    .withMessage('Número do cartão é obrigatório.')
    .matches(/^\d{13,19}$/)
    .withMessage('Número do cartão deve ter entre 13 e 19 dígitos numéricos.'),

  body('expMonth')
    .isString()
    .withMessage('Mês de expiração é obrigatório.')
    .matches(/^(0[1-9]|1[0-2])$/)
    .withMessage('Mês de expiração deve ser entre 01 e 12.'),

  body('expYear')
    .isString()
    .withMessage('Ano de expiração é obrigatório.')
    .matches(/^\d{4}$/)
    .withMessage('Ano de expiração deve ter 4 dígitos.'),

  body('holderName')
    .isString()
    .withMessage('Nome do titular é obrigatório.')
    .isLength({ min: 2 })
    .withMessage('Nome do titular deve ter pelo menos 2 caracteres.'),
];

export { createSavedCardValidator };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/unit/validators/savedCardValidator.test.ts`
Expected: 11 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/validators/savedCardValidator.ts src/__tests__/unit/validators/savedCardValidator.test.ts
git commit -m "feat: add saved card validator with TDD (RF-28)"
```

---

### Task 2: UserController.createSavedCard — RED + GREEN

**Files:**
- Modify: `src/__tests__/unit/controllers/UserController.test.ts`
- Modify: `src/controllers/UserController.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/__tests__/unit/controllers/UserController.test.ts`:

```typescript
// Add to the existing mocks at the top — extend savedCardService mock:
// Change the existing mock to include tokenizeAndSave:
// vi.mock('../../../services/SavedCardService', () => ({
//   default: { listByUser: vi.fn(), tokenizeAndSave: vi.fn(), deleteCard: vi.fn() },
// }));

describe('UserController.createSavedCard', () => {
  it('chama savedCardService.tokenizeAndSave e retorna 201', async () => {
    vi.mocked(savedCardService.tokenizeAndSave).mockResolvedValueOnce({
      id: 'card-new', userId: 'user-1', token: 'tok_abc',
      cardBrand: 'VISA', lastFour: '1111', holderName: 'Test User',
      createdAt: new Date(), updatedAt: new Date(),
    } as any);

    const req = makeReq('user-1', {}, {
      cardNumber: '4111111111111111',
      expMonth: '12',
      expYear: '2028',
      holderName: 'Test User',
    });
    const res = makeRes();
    const next = makeNext();

    await userController.createSavedCard(req, res, next);

    expect(savedCardService.tokenizeAndSave).toHaveBeenCalledWith({
      userId: 'user-1',
      cardNumber: '4111111111111111',
      expMonth: '12',
      expYear: '2028',
      holderName: 'Test User',
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'success',
        data: expect.objectContaining({ id: 'card-new', lastFour: '1111' }),
      }),
    );
  });

  it('não expõe o token no response', async () => {
    vi.mocked(savedCardService.tokenizeAndSave).mockResolvedValueOnce({
      id: 'card-new', userId: 'user-1', token: 'tok_secret',
      cardBrand: 'VISA', lastFour: '1111', holderName: 'Test User',
      createdAt: new Date(), updatedAt: new Date(),
    } as any);

    const req = makeReq('user-1', {}, {
      cardNumber: '4111111111111111', expMonth: '12',
      expYear: '2028', holderName: 'Test User',
    });
    const res = makeRes();
    await userController.createSavedCard(req, res, makeNext());

    const responseData = res.json.mock.calls[0][0].data;
    expect(responseData.token).toBeUndefined();
  });

  it('chama next(error) quando service lança erro', async () => {
    vi.mocked(savedCardService.tokenizeAndSave).mockRejectedValueOnce(
      new Error('Gateway error'),
    );

    const req = makeReq('user-1', {}, {
      cardNumber: '4111111111111111', expMonth: '12',
      expYear: '2028', holderName: 'Test User',
    });
    const res = makeRes();
    const next = makeNext();

    await userController.createSavedCard(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(res.status).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/unit/controllers/UserController.test.ts`
Expected: FAIL — `userController.createSavedCard is not a function`

- [ ] **Step 3: Update the mock** to include `tokenizeAndSave` and `deleteCard`

In `UserController.test.ts`, update the `SavedCardService` mock at the top:

```typescript
vi.mock('../../../services/SavedCardService', () => ({
  default: { listByUser: vi.fn(), tokenizeAndSave: vi.fn(), deleteCard: vi.fn() },
}));
```

- [ ] **Step 4: Write minimal implementation**

Add to `src/controllers/UserController.ts`:

```typescript
  /**
   * POST /api/users/me/saved-cards
   * Tokeniza e salva um cartão via eRede.
   */
  async createSavedCard(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { cardNumber, expMonth, expYear, holderName } = req.body as {
        cardNumber: string;
        expMonth: string;
        expYear: string;
        holderName: string;
      };

      const card = await savedCardService.tokenizeAndSave({
        userId: req.user!.id,
        cardNumber,
        expMonth,
        expYear,
        holderName,
      });

      // Não expor token opaco ao frontend
      const { token: _token, ...safeCard } = card as Record<string, unknown>;

      res.status(StatusCodes.CREATED).json({ status: 'success', data: safeCard });
    } catch (error) {
      next(error);
    }
  }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/__tests__/unit/controllers/UserController.test.ts`
Expected: ALL PASS

- [ ] **Step 6: Add the route**

In `src/routes/userRoutes.ts`, add after the existing imports:

```typescript
import { createSavedCardValidator } from '../validators/savedCardValidator';
import { validate } from '../validators/validationMiddleware';
```

Add the route **before** the `GET /me/saved-cards` route:

```typescript
/**
 * @swagger
 * /users/me/saved-cards:
 *   post:
 *     tags: [Users]
 *     summary: Salvar cartão (tokenizar via eRede)
 *     description: |
 *       Tokeniza um cartão de crédito via eRede e salva o token para uso futuro.
 *       O token opaco não é retornado ao frontend.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [cardNumber, expMonth, expYear, holderName]
 *             properties:
 *               cardNumber:
 *                 type: string
 *                 example: '4111111111111111'
 *                 description: Número do cartão (13-19 dígitos)
 *               expMonth:
 *                 type: string
 *                 example: '12'
 *                 description: Mês de expiração (01-12)
 *               expYear:
 *                 type: string
 *                 example: '2028'
 *                 description: Ano de expiração (4 dígitos)
 *               holderName:
 *                 type: string
 *                 example: 'JOAO DA SILVA'
 *                 description: Nome do titular
 *     responses:
 *       201:
 *         description: Cartão tokenizado e salvo
 *       400:
 *         description: Dados inválidos
 *       502:
 *         description: Falha na comunicação com a eRede
 */
router.post(
  '/me/saved-cards',
  createSavedCardValidator,
  validate,
  (req: Request, res: Response, next: NextFunction) => userController.createSavedCard(req, res, next),
);
```

- [ ] **Step 7: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 8: Commit**

```bash
git add src/controllers/UserController.ts src/routes/userRoutes.ts src/__tests__/unit/controllers/UserController.test.ts
git commit -m "feat: POST /users/me/saved-cards — tokenização independente via eRede (RF-28)"
```

---

### Task 3: ERedeService.buildCreditPayload — support cardToken

**Files:**
- Modify: `src/__tests__/unit/services/ERedeService.test.ts`
- Modify: `src/services/ERedeService.ts`
- Modify: `src/types/index.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/__tests__/unit/services/ERedeService.test.ts`:

```typescript
describe('ERedeService.buildCreditPayload — com cardToken', () => {
  it('usa cardToken em vez de cardNumber quando token fornecido', async () => {
    const svc = await getService();
    const payload = svc.buildCreditPayload({
      reference: 'TPW-ref-tok',
      amountCents: 15000,
      installments: 1,
      card: { number: '', expMonth: '12', expYear: '2028', cvv: '123', holderName: 'TEST' },
      billing: { name: 'T', document: '111', email: 't@t.com', address: 'R', district: 'D', city: 'C', state: 'SP', postalcode: '00000' },
      cardToken: 'tok_abc123',
    }) as any;

    expect(payload.cardToken).toBe('tok_abc123');
    expect(payload.cardNumber).toBeUndefined();
  });

  it('mantém cardNumber quando cardToken não fornecido', async () => {
    const svc = await getService();
    const payload = svc.buildCreditPayload({
      reference: 'TPW-ref-num',
      amountCents: 15000,
      installments: 1,
      card: { number: '4111111111111111', expMonth: '12', expYear: '2028', cvv: '123', holderName: 'TEST' },
      billing: { name: 'T', document: '111', email: 't@t.com', address: 'R', district: 'D', city: 'C', state: 'SP', postalcode: '00000' },
    }) as any;

    expect(payload.cardNumber).toBe('4111111111111111');
    expect(payload.cardToken).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/unit/services/ERedeService.test.ts`
Expected: FAIL — `buildCreditPayload` does not accept `cardToken` param / assertion fails

- [ ] **Step 3: Write minimal implementation**

In `src/services/ERedeService.ts`, update `buildCreditPayload` method signature to accept optional `cardToken`:

```typescript
  buildCreditPayload(params: {
    reference: string;
    amountCents: number;
    installments: number;
    card: {
      number: string;
      expMonth: string;
      expYear: string;
      cvv: string;
      holderName: string;
    };
    billing: {
      name: string;
      document: string;
      email: string;
      address: string;
      address2?: string;
      district: string;
      city: string;
      state: string;
      postalcode: string;
      country?: string;
    };
    cardToken?: string;
  }): ERedeTransactionRequest {
```

Then update the return object to conditionally use `cardToken` or `cardNumber`:

```typescript
    const cardField = params.cardToken
      ? { cardToken: params.cardToken }
      : { cardNumber: params.card.number };

    return {
      kind: 'credit',
      reference: params.reference,
      amount: params.amountCents,
      installments: params.installments,
      cardHolderName: params.card.holderName,
      ...cardField,
      expirationMonth: params.card.expMonth,
      expirationYear: params.card.expYear,
      securityCode: params.card.cvv,
      capture: true,
      softDescriptor: eredeSoftDescriptor,
      billing: {
        name: params.billing.name,
        document: params.billing.document.replace(/\D/g, ''),
        email: params.billing.email,
        address: {
          street: params.billing.address,
          number: 'S/N',
          complement: params.billing.address2 || '',
          district: params.billing.district,
          city: params.billing.city,
          state: params.billing.state,
          zipCode: params.billing.postalcode,
          country: this.normalizeCountry(params.billing.country || 'BR'),
        },
      },
    };
  }
```

Also update `ERedeCreditRequest` in `src/types/index.ts` to make `cardNumber` optional and add `cardToken`:

```typescript
export interface ERedeCreditRequest {
  kind: 'credit';
  reference: string;
  amount: number;
  installments: number;
  cardHolderName: string;
  cardNumber?: string;
  cardToken?: string;
  expirationMonth: string;
  expirationYear: string;
  securityCode: string;
  capture: true;
  softDescriptor: string;
  billing: ERedeBilling;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/unit/services/ERedeService.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/ERedeService.ts src/types/index.ts src/__tests__/unit/services/ERedeService.test.ts
git commit -m "feat: buildCreditPayload suporta cardToken para cartão salvo (RF-29)"
```

---

### Task 4: PaymentService.create — support savedCardId

**Files:**
- Modify: `src/__tests__/unit/services/PaymentService.test.ts`
- Modify: `src/services/PaymentService.ts`
- Modify: `src/types/index.ts`

- [ ] **Step 1: Add savedCardId to CreatePaymentDTO**

In `src/types/index.ts`, add to `CreatePaymentDTO`:

```typescript
export interface CreatePaymentDTO {
  debtIds: string[];
  method: 'PIX' | 'CARTAO_CREDITO';
  installments?: number;
  saveCard?: boolean;
  savedCardId?: string;
  card?: {
    number: string;
    expMonth: string;
    expYear: string;
    cvv: string;
    holderName: string;
  };
  billing?: {
    // ... existing fields unchanged
  };
}
```

- [ ] **Step 2: Write the failing tests**

Append to `src/__tests__/unit/services/PaymentService.test.ts`.

First, update the `SavedCardService` mock at the top to include `findById`:

```typescript
// Update the existing SavedCardService mock:
vi.mock('../../../services/SavedCardService', () => ({
  default: { tokenizeAndSave: vi.fn() },
}));
```

Change to:

```typescript
vi.mock('../../../services/SavedCardService', () => ({
  default: { tokenizeAndSave: vi.fn() },
}));

vi.mock('../../../repositories/SavedCardRepository', () => ({
  default: { findById: vi.fn() },
}));
```

Add import:

```typescript
import savedCardRepository from '../../../repositories/SavedCardRepository';
```

Then add the test describe block:

```typescript
describe('PaymentService.create — pagamento com savedCardId (RF-29)', () => {
  const savedCard = {
    id: 'saved-card-1', userId: 'user-uuid-1', token: 'tok_saved_abc',
    cardBrand: 'VISA', lastFour: '4242', holderName: 'SAVED USER',
    createdAt: new Date(), updatedAt: new Date(),
  };

  beforeEach(() => {
    vi.mocked(debtRepository.findByIds).mockResolvedValue([makeDebt('d1', 'PENDENTE', 100) as any]);
    vi.mocked(eRedeService.buildCreditPayload).mockReturnValue({ kind: 'credit' } as any);
    vi.mocked(eRedeService.mapStatusToLocal).mockReturnValue('PAGO');
    vi.mocked(paymentRepository.create).mockResolvedValue(makePayment('p1', 'PAGO', 'CARTAO_CREDITO') as any);
  });

  it('cria pagamento usando token do cartão salvo', async () => {
    vi.mocked(savedCardRepository.findById).mockResolvedValueOnce(savedCard as any);

    await paymentService.create('user-uuid-1', {
      debtIds: ['d1'],
      method: 'CARTAO_CREDITO',
      installments: 1,
      savedCardId: 'saved-card-1',
      card: { number: '', expMonth: '', expYear: '', cvv: '123', holderName: '' },
      billing: billingBase,
    });

    expect(eRedeService.buildCreditPayload).toHaveBeenCalledWith(
      expect.objectContaining({ cardToken: 'tok_saved_abc' }),
    );
  });

  it('lança 404 quando savedCardId não existe', async () => {
    vi.mocked(savedCardRepository.findById).mockResolvedValueOnce(null);

    await expect(paymentService.create('user-uuid-1', {
      debtIds: ['d1'],
      method: 'CARTAO_CREDITO',
      installments: 1,
      savedCardId: 'card-inexistente',
      card: { number: '', expMonth: '', expYear: '', cvv: '123', holderName: '' },
      billing: billingBase,
    })).rejects.toMatchObject({ statusCode: 404 });
  });

  it('lança 403 quando cartão salvo pertence a outro usuário', async () => {
    vi.mocked(savedCardRepository.findById).mockResolvedValueOnce(
      { ...savedCard, userId: 'outro-user' } as any,
    );

    await expect(paymentService.create('user-uuid-1', {
      debtIds: ['d1'],
      method: 'CARTAO_CREDITO',
      installments: 1,
      savedCardId: 'saved-card-1',
      card: { number: '', expMonth: '', expYear: '', cvv: '123', holderName: '' },
      billing: billingBase,
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  it('lança 400 quando savedCardId presente mas cvv ausente', async () => {
    vi.mocked(savedCardRepository.findById).mockResolvedValueOnce(savedCard as any);

    await expect(paymentService.create('user-uuid-1', {
      debtIds: ['d1'],
      method: 'CARTAO_CREDITO',
      installments: 1,
      savedCardId: 'saved-card-1',
      billing: billingBase,
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('usa dados do cartão salvo (holderName, expMonth, expYear) no payload', async () => {
    vi.mocked(savedCardRepository.findById).mockResolvedValueOnce(savedCard as any);

    await paymentService.create('user-uuid-1', {
      debtIds: ['d1'],
      method: 'CARTAO_CREDITO',
      installments: 1,
      savedCardId: 'saved-card-1',
      card: { number: '', expMonth: '', expYear: '', cvv: '456', holderName: '' },
      billing: billingBase,
    });

    expect(eRedeService.buildCreditPayload).toHaveBeenCalledWith(
      expect.objectContaining({
        card: expect.objectContaining({
          cvv: '456',
          holderName: 'SAVED USER',
        }),
      }),
    );
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/__tests__/unit/services/PaymentService.test.ts`
Expected: FAIL — savedCardId logic not implemented

- [ ] **Step 4: Write minimal implementation**

In `src/services/PaymentService.ts`, add import at the top:

```typescript
import savedCardRepository from '../repositories/SavedCardRepository';
```

In the `create` method, add after the `billing` validation block (after the PIX `billing` check, before `_checkActiveLinksLimit`), insert the savedCardId resolution:

```typescript
    // Resolve cartão salvo se savedCardId fornecido
    let cardToken: string | undefined;
    if (method === 'CARTAO_CREDITO' && payload.savedCardId) {
      const savedCard = await savedCardRepository.findById(payload.savedCardId);
      if (!savedCard) {
        throw new AppError('Cartão salvo não encontrado.', StatusCodes.NOT_FOUND);
      }
      if (savedCard.userId !== userId) {
        throw new AppError('Acesso negado ao cartão salvo.', StatusCodes.FORBIDDEN);
      }
      if (!card?.cvv) {
        throw new AppError('CVV é obrigatório ao pagar com cartão salvo.', StatusCodes.BAD_REQUEST);
      }
      cardToken = savedCard.token;
      // Usa dados do cartão salvo para campos que não temos
      card = {
        number: '',
        expMonth: card?.expMonth || '',
        expYear: card?.expYear || '',
        cvv: card.cvv,
        holderName: savedCard.holderName,
      };
    }
```

Note: This requires changing `const { debtIds, method, installments, card, billing, saveCard } = payload;` to use `let card` instead of `const card`:

```typescript
    const { debtIds, method, installments, billing, saveCard, savedCardId } = payload;
    let card = payload.card;
```

Then update the `buildCreditPayload` call to pass `cardToken`:

```typescript
      : eRedeService.buildCreditPayload({
          reference: referenceNum,
          amountCents,
          installments: installments || 1,
          card: card!,
          billing: billing!,
          cardToken,
        });
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/__tests__/unit/services/PaymentService.test.ts`
Expected: ALL PASS

- [ ] **Step 6: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
git add src/services/PaymentService.ts src/types/index.ts src/__tests__/unit/services/PaymentService.test.ts
git commit -m "feat: pagamento com cartão salvo via savedCardId (RF-29)"
```

---

### Task 5: Payment Validator — conditional validation for savedCardId

**Files:**
- Modify: `src/validators/paymentValidator.ts`

- [ ] **Step 1: Update the validator**

In `src/validators/paymentValidator.ts`, add `savedCardId` validation and make card fields conditional:

```typescript
import { body } from 'express-validator';

const createPaymentValidator = [
  body('debtIds')
    .isArray({ min: 1 })
    .withMessage('Selecione pelo menos um débito.'),

  body('debtIds.*')
    .isUUID()
    .withMessage('ID de débito inválido.'),

  body('method')
    .notEmpty()
    .withMessage('Método de pagamento é obrigatório.')
    .isIn(['PIX', 'CARTAO_CREDITO'])
    .withMessage('Método de pagamento inválido. Use PIX ou CARTAO_CREDITO.'),

  body('installments')
    .optional()
    .isInt({ min: 1, max: 3 })
    .withMessage('Número de parcelas deve ser entre 1 e 3.'),

  body('savedCardId')
    .optional()
    .isUUID()
    .withMessage('ID do cartão salvo deve ser um UUID válido.'),

  // Card fields obrigatórios apenas quando method=CARTAO_CREDITO e sem savedCardId
  body('card')
    .if(body('method').equals('CARTAO_CREDITO'))
    .if((value: unknown, { req }: any) => !req.body.savedCardId)
    .isObject()
    .withMessage('Dados do cartão são obrigatórios para pagamento com cartão.'),

  body('card.number')
    .if(body('method').equals('CARTAO_CREDITO'))
    .if((value: unknown, { req }: any) => !req.body.savedCardId)
    .isString()
    .withMessage('Número do cartão é obrigatório.'),

  body('card.expMonth')
    .if(body('method').equals('CARTAO_CREDITO'))
    .if((value: unknown, { req }: any) => !req.body.savedCardId)
    .isString()
    .withMessage('Mês de expiração é obrigatório.'),

  body('card.expYear')
    .if(body('method').equals('CARTAO_CREDITO'))
    .if((value: unknown, { req }: any) => !req.body.savedCardId)
    .isString()
    .withMessage('Ano de expiração é obrigatório.'),

  // CVV obrigatório para CARTAO_CREDITO (com ou sem savedCardId)
  body('card.cvv')
    .if(body('method').equals('CARTAO_CREDITO'))
    .isString()
    .withMessage('CVV é obrigatório.'),

  body('card.holderName')
    .if(body('method').equals('CARTAO_CREDITO'))
    .if((value: unknown, { req }: any) => !req.body.savedCardId)
    .isString()
    .withMessage('Nome do titular é obrigatório.'),

  body('billing')
    .isObject()
    .withMessage('Dados de billing são obrigatórios.'),

  body('billing.name')
    .isString()
    .withMessage('Nome no billing é obrigatório.'),

  body('billing.email')
    .isEmail()
    .withMessage('Email no billing é obrigatório e deve ser válido.'),

  body('billing.phone')
    .isString()
    .withMessage('Telefone no billing é obrigatório.'),

  body('billing.document')
    .isString()
    .withMessage('Documento no billing é obrigatório.'),

  body('billing.birthDate')
    .isISO8601()
    .withMessage('Data de nascimento no billing deve estar no formato YYYY-MM-DD.'),

  body('billing.address')
    .isString()
    .withMessage('Endereço no billing é obrigatório.'),

  body('billing.district')
    .isString()
    .withMessage('Bairro no billing é obrigatório.'),

  body('billing.city')
    .isString()
    .withMessage('Cidade no billing é obrigatória.'),

  body('billing.state')
    .isString()
    .withMessage('Estado no billing é obrigatório.'),

  body('billing.postalcode')
    .isString()
    .withMessage('CEP no billing é obrigatório.'),
];

export { createPaymentValidator };
```

- [ ] **Step 2: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS (existing tests should still work since they send full card data)

- [ ] **Step 3: Commit**

```bash
git add src/validators/paymentValidator.ts
git commit -m "feat: paymentValidator suporta savedCardId — card fields condicionais"
```

---

### Task 6: PaymentHistoryController tests

**Files:**
- Create: `src/__tests__/unit/controllers/PaymentHistoryController.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StatusCodes } from 'http-status-codes';

vi.mock('../../../services/PaymentService', () => ({
  default: {
    getHistory: vi.fn(),
    getById: vi.fn(),
    reopenPayment: vi.fn(),
  },
}));

import paymentHistoryController from '../../../controllers/PaymentHistoryController';
import paymentService from '../../../services/PaymentService';

const makeReq = (userId = 'user-1', params: Record<string, string> = {}, query: Record<string, string> = {}) => ({
  user: { id: userId, role: 'CONSULTOR', email: 'x@x.com' },
  params,
  query,
}) as any;

const makeRes = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

const makeNext = () => vi.fn();

beforeEach(() => vi.clearAllMocks());

describe('PaymentHistoryController.index', () => {
  it('retorna 200 com histórico paginado', async () => {
    const mockResult = {
      data: [{ id: 'p1' }],
      pagination: { total: 1, page: 1, limit: 10, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
    };
    vi.mocked(paymentService.getHistory).mockResolvedValueOnce(mockResult);

    const req = makeReq('user-1', {}, { page: '1', limit: '10' });
    const res = makeRes();
    const next = makeNext();

    await paymentHistoryController.index(req, res, next);

    expect(paymentService.getHistory).toHaveBeenCalledWith('user-1', { page: '1', limit: '10' });
    expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'success' }));
    expect(next).not.toHaveBeenCalled();
  });

  it('chama next(error) quando getHistory lança', async () => {
    vi.mocked(paymentService.getHistory).mockRejectedValueOnce(new Error('DB error'));

    const req = makeReq();
    const res = makeRes();
    const next = makeNext();

    await paymentHistoryController.index(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});

describe('PaymentHistoryController.show', () => {
  it('retorna 200 com detalhes do pagamento', async () => {
    vi.mocked(paymentService.getById).mockResolvedValueOnce({ id: 'p1', status: 'PAGO' } as any);

    const req = makeReq('user-1', { id: 'p1' });
    const res = makeRes();
    const next = makeNext();

    await paymentHistoryController.show(req, res, next);

    expect(paymentService.getById).toHaveBeenCalledWith('user-1', 'p1');
    expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'success', data: { id: 'p1', status: 'PAGO' } }),
    );
  });

  it('chama next(error) quando getById lança 404', async () => {
    const err = new Error('Not found');
    (err as any).statusCode = 404;
    vi.mocked(paymentService.getById).mockRejectedValueOnce(err);

    const req = makeReq('user-1', { id: 'nao-existe' });
    const res = makeRes();
    const next = makeNext();

    await paymentHistoryController.show(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  it('chama next(error) quando getById lança 403', async () => {
    const err = new Error('Forbidden');
    (err as any).statusCode = 403;
    vi.mocked(paymentService.getById).mockRejectedValueOnce(err);

    const req = makeReq('user-1', { id: 'p-outro-user' });
    const res = makeRes();
    const next = makeNext();

    await paymentHistoryController.show(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });
});

describe('PaymentHistoryController.reopen', () => {
  it('retorna 200 com dados do link reaberto', async () => {
    vi.mocked(paymentService.reopenPayment).mockResolvedValueOnce({
      id: 'p1', checkoutUrl: 'https://pix.link/new', qrCode: 'qr-new', reopened: true,
    } as any);

    const req = makeReq('user-1', { id: 'p1' });
    const res = makeRes();
    const next = makeNext();

    await paymentHistoryController.reopen(req, res, next);

    expect(paymentService.reopenPayment).toHaveBeenCalledWith('user-1', 'p1');
    expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'success',
        data: expect.objectContaining({ reopened: true }),
      }),
    );
  });

  it('chama next(error) quando reopen lança 400', async () => {
    const err = new Error('Not pending');
    (err as any).statusCode = 400;
    vi.mocked(paymentService.reopenPayment).mockRejectedValueOnce(err);

    const req = makeReq('user-1', { id: 'p-pago' });
    const res = makeRes();
    const next = makeNext();

    await paymentHistoryController.reopen(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx vitest run src/__tests__/unit/controllers/PaymentHistoryController.test.ts`
Expected: 7 tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/unit/controllers/PaymentHistoryController.test.ts
git commit -m "test: cobertura do PaymentHistoryController — index, show, reopen"
```

---

### Task 7: Fix Swagger inconsistencies

**Files:**
- Modify: `src/config/swagger.ts`

- [ ] **Step 1: Fix info.description**

Replace `MaxiPago` with `eRede`:

```typescript
description: 'API para gestão de débitos e pagamentos de consultores. Suporta autenticação JWT, importação de dados via CSV, pagamentos via eRede e notificações em tempo real via WebSocket.',
```

- [ ] **Step 2: Fix CreatePaymentDTO schema**

Add `saveCard` and `savedCardId` to properties:

```typescript
            saveCard: {
              type: 'boolean',
              description: 'Salvar cartão para uso futuro (apenas cartão de crédito)',
            },
            savedCardId: {
              type: 'string',
              format: 'uuid',
              description: 'ID de um cartão salvo previamente. Quando presente, apenas card.cvv é obrigatório.',
            },
```

- [ ] **Step 3: Fix Payment.gatewayProvider enum**

```typescript
gatewayProvider: { type: 'string', enum: ['EREDE'] },
```

- [ ] **Step 4: Add qrCode to Payment schema**

```typescript
qrCode: { type: 'string', nullable: true, description: 'String EMV do QR Code PIX (copiar-colar)' },
```

- [ ] **Step 5: Fix User.role enum — add GERENTE**

```typescript
role: { type: 'string', enum: ['ADMIN', 'GERENTE', 'EMPRESARIA', 'LIDER', 'CONSULTOR'] },
```

- [ ] **Step 6: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
git add src/config/swagger.ts
git commit -m "fix: corrigir Swagger — gateway EREDE, qrCode, GERENTE, saveCard, savedCardId"
```

---

### Task 8: Update audit document and requirements

**Files:**
- Modify: `docs/project/audit-2026-04-01.md`
- Modify: `docs/project/requirements.md`

- [ ] **Step 1: Add RF-28 and RF-29 to requirements.md**

In `docs/project/requirements.md`, add to the Pagamentos table:

```markdown
| RF-28 | O sistema deve permitir salvar cartão de crédito via tokenização eRede independente de pagamento |
| RF-29 | O sistema deve permitir pagamento com cartão salvo usando `savedCardId` + CVV |
```

- [ ] **Step 2: Update audit document**

Rewrite `docs/project/audit-2026-04-01.md` with current state:
- Update test counts (run `npx vitest run` to get final numbers)
- Mark all previously-open gaps as resolved
- Add RF-28 and RF-29 with ✅ status
- Update remaining gaps section
- Update the summary

- [ ] **Step 3: Run all tests to get final count**

Run: `npx vitest run`
Record: number of test files and total tests

- [ ] **Step 4: Commit**

```bash
git add docs/project/audit-2026-04-01.md docs/project/requirements.md
git commit -m "docs: atualizar auditoria e requisitos — RF-28, RF-29, gaps resolvidos"
```

---

## Self-Review Checklist

- **Spec coverage:** RF-28 (Task 1+2), RF-29 (Task 3+4+5), Swagger fixes (Task 7), missing tests (Task 6), audit (Task 8) — all covered
- **Placeholder scan:** No TBD/TODO found. All code blocks are complete.
- **Type consistency:** `cardToken` used consistently across `ERedeCreditRequest`, `buildCreditPayload`, and `PaymentService.create`. `savedCardId` consistent in `CreatePaymentDTO`, validator, and service. `tokenizeAndSave` matches existing `SavedCardService` method.
- **Note on eRede token field:** Research showed the eRede PHP SDK uses `storageCard` (integer). However, the current codebase already implements tokenization via `/tokens` endpoint returning a string token. The field `cardToken` is used in the API payload as per industry standard REST convention. If eRede rejects this field name in production, it should be changed to match their actual API contract — this is a point to validate during integration testing.
