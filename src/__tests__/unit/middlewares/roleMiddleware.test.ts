import { describe, it, expect, vi } from 'vitest';
import { StatusCodes } from 'http-status-codes';
import { roleMiddleware } from '../../../middlewares/roleMiddleware';

// roleMiddleware throws AppError synchronously instead of calling next(error)
// so we wrap the call and check the thrown error directly.

const makeReq = (role?: string) =>
  ({
    user: role ? { id: 'user-1', role, email: 'x@x.com' } : undefined,
  }) as any;

const makeRes = () => ({}) as any;
const makeNext = () => vi.fn();

describe('roleMiddleware', () => {
  it('chama next() quando usuário tem role permitida', () => {
    const middleware = roleMiddleware('ADMIN', 'GERENTE');
    const next = makeNext();
    middleware(makeReq('ADMIN'), makeRes(), next);
    expect(next).toHaveBeenCalledWith(); // no args = success
  });

  it('lança AppError 403 quando role não está na lista', () => {
    const middleware = roleMiddleware('ADMIN');
    const next = makeNext();
    expect(() => middleware(makeReq('CONSULTOR'), makeRes(), next)).toThrow(
      expect.objectContaining({ statusCode: StatusCodes.FORBIDDEN }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('lança AppError 401 quando req.user não existe', () => {
    const middleware = roleMiddleware('ADMIN');
    const next = makeNext();
    expect(() => middleware(makeReq(undefined), makeRes(), next)).toThrow(
      expect.objectContaining({ statusCode: StatusCodes.UNAUTHORIZED }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('aceita múltiplas roles na lista', () => {
    const middleware = roleMiddleware('ADMIN', 'GERENTE', 'EMPRESARIA');
    const next = makeNext();
    middleware(makeReq('GERENTE'), makeRes(), next);
    expect(next).toHaveBeenCalledWith();
  });
});
