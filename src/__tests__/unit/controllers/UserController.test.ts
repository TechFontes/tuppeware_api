import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StatusCodes } from 'http-status-codes';

vi.mock('../../../services/SavedCardService', () => ({
  default: { listByUser: vi.fn() },
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
