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

vi.mock('../../../services/SettingsService', () => ({
  default: {
    getAll: vi.fn(),
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
import userService from '../../../services/UserService';
import settingsService from '../../../services/SettingsService';

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

describe('UserController.getMe', () => {
  it('inclui bloco settings com flags públicas tipadas', async () => {
    vi.mocked(userService.findById).mockResolvedValueOnce({
      id: 'user-1',
      email: 'x@x.com',
      role: 'CONSULTOR',
    } as any);
    vi.mocked(settingsService.getAll).mockResolvedValueOnce({
      partial_payment_enabled: 'true',
      partial_payment_min_amount: '10.00',
      partial_payment_min_remaining: '20.00',
      payment_webhook_secret: 'super-secret-32-characters-long!',
      payment_webhook_url: 'https://example.com/hook',
    });

    const req = makeReq('user-1');
    const res = makeRes();
    const next = makeNext();

    await userController.getMe(req, res, next);

    expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
    const payload = res.json.mock.calls[0][0];
    expect(payload.data).toMatchObject({
      id: 'user-1',
      settings: {
        partialPaymentEnabled: true,
        partialPaymentMinAmount: '10.00',
        partialPaymentMinRemaining: '20.00',
      },
    });
  });

  it('não expõe chaves sensíveis em settings', async () => {
    vi.mocked(userService.findById).mockResolvedValueOnce({
      id: 'user-1',
      email: 'x@x.com',
      role: 'CONSULTOR',
    } as any);
    vi.mocked(settingsService.getAll).mockResolvedValueOnce({
      partial_payment_enabled: 'true',
      payment_webhook_secret: 'super-secret-32-characters-long!',
      payment_webhook_url: 'https://example.com/hook',
    });

    const req = makeReq('user-1');
    const res = makeRes();
    await userController.getMe(req, res, makeNext());

    const settings = res.json.mock.calls[0][0].data.settings;
    expect(settings.payment_webhook_secret).toBeUndefined();
    expect(settings.paymentWebhookSecret).toBeUndefined();
    expect(settings.payment_webhook_url).toBeUndefined();
    expect(settings.paymentWebhookUrl).toBeUndefined();
  });

  it('retorna defaults seguros quando settings não estão configurados', async () => {
    vi.mocked(userService.findById).mockResolvedValueOnce({
      id: 'user-1',
      email: 'x@x.com',
      role: 'CONSULTOR',
    } as any);
    vi.mocked(settingsService.getAll).mockResolvedValueOnce({});

    const req = makeReq('user-1');
    const res = makeRes();
    await userController.getMe(req, res, makeNext());

    expect(res.json.mock.calls[0][0].data.settings).toEqual({
      partialPaymentEnabled: false,
      partialPaymentMinAmount: null,
      partialPaymentMinRemaining: null,
    });
  });
});

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
  it('chama savedCardService.tokenizeAndSave (com email) e retorna 201', async () => {
    vi.mocked(savedCardService.tokenizeAndSave).mockResolvedValueOnce({
      id: 'card-new', status: 'ACTIVE', cardBrand: 'VISA', lastFour: '1111',
      holderName: 'Test User', bin: null, createdAt: new Date(),
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
      email: 'x@x.com',
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

  it('não expõe tokenizationId no response (SavedCardPublicView)', async () => {
    vi.mocked(savedCardService.tokenizeAndSave).mockResolvedValueOnce({
      id: 'card-new', status: 'PENDING', cardBrand: 'VISA', lastFour: '1111',
      holderName: 'Test User', bin: null, createdAt: new Date(),
    } as any);

    const req = makeReq('user-1', {}, {
      cardNumber: '4111111111111111', expMonth: '12',
      expYear: '2028', holderName: 'Test User',
    });
    const res = makeRes();
    await userController.createSavedCard(req, res, makeNext());

    const responseData = res.json.mock.calls[0][0].data;
    expect(responseData.tokenizationId).toBeUndefined();
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
