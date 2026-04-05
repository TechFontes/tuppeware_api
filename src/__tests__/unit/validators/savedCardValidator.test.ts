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
