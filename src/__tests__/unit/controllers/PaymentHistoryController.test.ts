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
      data: [{ id: 'p1', paymentDebts: [] }],
      pagination: { total: 1, page: 1, limit: 10, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
    } as any;
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
