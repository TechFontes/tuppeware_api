import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StatusCodes } from 'http-status-codes';

vi.mock('../../../services/SavedCardService', () => ({
  default: { listByUser: vi.fn(), tokenizeAndSave: vi.fn(), deleteCard: vi.fn() },
}));

vi.mock('../../../services/UserService', () => ({
  default: {
    findById: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('../../../repositories/SavedCardRepository', () => ({
  default: {
    findByUserId: vi.fn(),
    findById: vi.fn(),
    delete: vi.fn(),
  },
}));

import userController from '../../../controllers/UserController';
import savedCardService from '../../../services/SavedCardService';

const makeReq = (userId = 'user-1', params: Record<string, string> = {}, body: object = {}) => ({
  user: { id: userId, role: 'CONSULTOR', email: 'x@x.com' },
  params,
  body,
}) as any;

const makeRes = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

const makeNext = () => vi.fn();

beforeEach(() => vi.clearAllMocks());

describe('UserController.getSavedCards', () => {
  it('chama savedCardService.listByUser e retorna 200', async () => {
    vi.mocked(savedCardService.listByUser).mockResolvedValueOnce([
      { id: 'card-1', lastFour: '1111' },
    ] as any);

    const req = makeReq('user-1');
    const res = makeRes();
    const next = makeNext();

    await userController.getSavedCards(req, res, next);

    expect(savedCardService.listByUser).toHaveBeenCalledWith('user-1');
    expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
    expect(next).not.toHaveBeenCalled();
  });
});

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
