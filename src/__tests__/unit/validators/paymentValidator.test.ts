import { describe, it, expect } from 'vitest';
import { validationResult } from 'express-validator';
import { createPaymentValidator } from '../../../validators/paymentValidator';

const runValidation = async (body: Record<string, unknown>) => {
  const req = { body } as any;
  const res = {} as any;
  for (const middleware of createPaymentValidator) {
    await new Promise<void>((resolve) => {
      middleware(req, res, () => resolve());
    });
  }
  return validationResult(req);
};

const baseBody = {
  debtIds: ['550e8400-e29b-41d4-a716-446655440000'],
  method: 'PIX',
  installments: 1,
  billing: {
    name: 'Maria Silva',
    email: 'maria@email.com',
    phone: '11999999999',
    document: '12345678901',
    address: 'Rua Exemplo, 100',
    district: 'Centro',
    city: 'São Paulo',
    state: 'SP',
    postalcode: '01001000',
  },
};

const billingErrors = (errors: ReturnType<ReturnType<typeof validationResult>['array']>) =>
  errors.filter((e: any) => e.path?.startsWith('billing.birthDate'));

describe('createPaymentValidator — billing.birthDate é opcional', () => {
  it('aceita body sem birthDate (campo ausente)', async () => {
    const result = await runValidation(baseBody);
    expect(billingErrors(result.array())).toHaveLength(0);
  });

  it('aceita birthDate como string vazia', async () => {
    const body = { ...baseBody, billing: { ...baseBody.billing, birthDate: '' } };
    const result = await runValidation(body);
    expect(billingErrors(result.array())).toHaveLength(0);
  });

  it('aceita birthDate como null', async () => {
    const body = { ...baseBody, billing: { ...baseBody.billing, birthDate: null } };
    const result = await runValidation(body);
    expect(billingErrors(result.array())).toHaveLength(0);
  });

  it('aceita birthDate em formato ISO 8601 (YYYY-MM-DD)', async () => {
    const body = { ...baseBody, billing: { ...baseBody.billing, birthDate: '1990-01-20' } };
    const result = await runValidation(body);
    expect(billingErrors(result.array())).toHaveLength(0);
  });

  it('aceita birthDate em ISO 8601 completo', async () => {
    const body = {
      ...baseBody,
      billing: { ...baseBody.billing, birthDate: '1990-01-20T00:00:00.000Z' },
    };
    const result = await runValidation(body);
    expect(billingErrors(result.array())).toHaveLength(0);
  });

  it('rejeita birthDate em formato inválido', async () => {
    const body = { ...baseBody, billing: { ...baseBody.billing, birthDate: '20/01/1990' } };
    const result = await runValidation(body);
    const errs = billingErrors(result.array());
    expect(errs.length).toBeGreaterThan(0);
    expect((errs[0] as any).msg).toContain('YYYY-MM-DD');
  });
});
