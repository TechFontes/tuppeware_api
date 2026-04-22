import { describe, it, expect, vi } from 'vitest';
import validate from '../../../validators/partialPaymentValidator';

const mkReq = (body: any) => ({ body } as any);
const mkRes = () => {
  const r: any = {};
  r.status = vi.fn().mockReturnValue(r);
  r.json = vi.fn().mockReturnValue(r);
  return r;
};

describe('partialPaymentValidator', () => {
  it('passa next() sem erro com payload válido', () => {
    const next = vi.fn();
    validate(mkReq({ debtId: 'abc', amount: 40 }), mkRes(), next);
    expect(next).toHaveBeenCalledWith();
  });

  it('aceita amount com 2 casas decimais', () => {
    const next = vi.fn();
    validate(mkReq({ debtId: 'abc', amount: 40.50 }), mkRes(), next);
    expect(next).toHaveBeenCalledWith();
  });

  it('rejeita sem debtId', () => {
    const next = vi.fn();
    validate(mkReq({ amount: 40 }), mkRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  it('rejeita debtId vazio', () => {
    const next = vi.fn();
    validate(mkReq({ debtId: '', amount: 40 }), mkRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  it('rejeita amount não-numérico', () => {
    const next = vi.fn();
    validate(mkReq({ debtId: 'a', amount: 'x' }), mkRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  it('rejeita amount <= 0', () => {
    const next = vi.fn();
    validate(mkReq({ debtId: 'a', amount: 0 }), mkRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  it('rejeita amount com mais de 2 casas decimais', () => {
    const next = vi.fn();
    validate(mkReq({ debtId: 'a', amount: 10.123 }), mkRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  it('rejeita amount NaN', () => {
    const next = vi.fn();
    validate(mkReq({ debtId: 'a', amount: NaN }), mkRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });
});
