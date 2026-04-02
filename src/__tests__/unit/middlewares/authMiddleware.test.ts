import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StatusCodes } from 'http-status-codes';
import jwt from 'jsonwebtoken';

// NODE_ENV=test causes config/auth.ts to use the fallback secret when
// JWT_SECRET is not defined. We sign test tokens with the same fallback so
// jwt.verify succeeds without needing module resets.
process.env.NODE_ENV = 'test';
delete process.env.JWT_SECRET; // ensure fallback is used

import { authMiddleware } from '../../../middlewares/authMiddleware';

// authMiddleware is synchronous and throws AppError directly instead of
// calling next(error), so error cases use expect(() => ...).toThrow(...)

// Must match the fallback in src/config/auth.ts
const TEST_SECRET = 'default-secret-change-me';

const makeReq = (authHeader?: string) =>
  ({
    headers: authHeader ? { authorization: authHeader } : {},
  }) as any;

const makeRes = () => ({}) as any;
const makeNext = () => vi.fn();

const validToken = jwt.sign(
  { id: 'user-1', role: 'CONSULTOR', email: 'test@email.com' },
  TEST_SECRET,
  { expiresIn: '1h' },
);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('authMiddleware', () => {
  it('chama next() e define req.user quando token é válido', () => {
    const req = makeReq(`Bearer ${validToken}`);
    const next = makeNext();

    authMiddleware(req, makeRes(), next);

    expect(next).toHaveBeenCalledWith(); // called with no args = success
    expect(req.user).toMatchObject({
      id: 'user-1',
      role: 'CONSULTOR',
      email: 'test@email.com',
    });
  });

  it('lança AppError 401 quando não há header Authorization', () => {
    const req = makeReq(); // no authorization header
    const next = makeNext();

    expect(() => authMiddleware(req, makeRes(), next)).toThrow(
      expect.objectContaining({ statusCode: StatusCodes.UNAUTHORIZED }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('lança AppError 401 quando token é inválido/malformado', () => {
    const req = makeReq('Bearer token.invalido.aqui');
    const next = makeNext();

    expect(() => authMiddleware(req, makeRes(), next)).toThrow(
      expect.objectContaining({ statusCode: StatusCodes.UNAUTHORIZED }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('lança AppError 401 quando token expirado', () => {
    const expiredToken = jwt.sign(
      { id: 'user-1', role: 'CONSULTOR', email: 'test@email.com' },
      TEST_SECRET,
      { expiresIn: '-1s' }, // expired 1 second ago
    );
    const req = makeReq(`Bearer ${expiredToken}`);
    const next = makeNext();

    expect(() => authMiddleware(req, makeRes(), next)).toThrow(
      expect.objectContaining({ statusCode: StatusCodes.UNAUTHORIZED }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('lança AppError 401 quando formato do header não é "Bearer <token>"', () => {
    const req = makeReq(validToken); // token without "Bearer " prefix
    const next = makeNext();

    expect(() => authMiddleware(req, makeRes(), next)).toThrow(
      expect.objectContaining({ statusCode: StatusCodes.UNAUTHORIZED }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('lança AppError 401 quando token assinado com secret diferente', () => {
    const tokenWrongSecret = jwt.sign(
      { id: 'user-1', role: 'CONSULTOR', email: 'test@email.com' },
      'wrong-secret',
      { expiresIn: '1h' },
    );
    const req = makeReq(`Bearer ${tokenWrongSecret}`);
    const next = makeNext();

    expect(() => authMiddleware(req, makeRes(), next)).toThrow(
      expect.objectContaining({ statusCode: StatusCodes.UNAUTHORIZED }),
    );
    expect(next).not.toHaveBeenCalled();
  });
});
