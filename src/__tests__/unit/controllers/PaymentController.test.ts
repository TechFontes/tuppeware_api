import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StatusCodes } from 'http-status-codes';

vi.mock('../../../services/PaymentService', () => ({
  default: {
    processGatewayCallback: vi.fn(),
    create: vi.fn(),
  },
}));

import paymentController from '../../../controllers/PaymentController';
import paymentService from '../../../services/PaymentService';

const makeReq = (body: object = {}, headers: Record<string, string> = {}) => ({
  body,
  headers,
  user: { id: 'user-1', role: 'CONSULTOR', email: 'x@x.com' },
}) as any;

const makeRes = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

const makeNext = () => vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PaymentController.eredeCallback', () => {
  it('retorna 200 quando callback é válido sem secret configurado', async () => {
    delete process.env.EREDE_CALLBACK_SECRET;
    vi.mocked(paymentService.processGatewayCallback).mockResolvedValueOnce({} as any);

    const req = makeReq({ tid: 'tid-1', returnCode: '00', status: 0 });
    const res = makeRes();
    const next = makeNext();

    await paymentController.eredeCallback(req, res, next);

    expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejeita com 400 quando secret configurado mas header ausente', async () => {
    process.env.EREDE_CALLBACK_SECRET = 'meu-secret-callback';

    const req = makeReq({ tid: 'tid-1', returnCode: '00', status: 0 }, {}); // sem header
    const res = makeRes();
    const next = makeNext();

    await paymentController.eredeCallback(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: StatusCodes.BAD_REQUEST }),
    );
    expect(paymentService.processGatewayCallback).not.toHaveBeenCalled();

    delete process.env.EREDE_CALLBACK_SECRET;
  });

  it('rejeita com 400 quando header não confere com secret configurado', async () => {
    process.env.EREDE_CALLBACK_SECRET = 'meu-secret-callback';

    const req = makeReq(
      { tid: 'tid-1', returnCode: '00', status: 0 },
      { 'x-erede-secret': 'secret-errado' },
    );
    const res = makeRes();
    const next = makeNext();

    await paymentController.eredeCallback(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: StatusCodes.BAD_REQUEST }),
    );
    expect(paymentService.processGatewayCallback).not.toHaveBeenCalled();

    delete process.env.EREDE_CALLBACK_SECRET;
  });

  it('processa callback quando header confere com secret configurado', async () => {
    process.env.EREDE_CALLBACK_SECRET = 'meu-secret-callback';
    vi.mocked(paymentService.processGatewayCallback).mockResolvedValueOnce({} as any);

    const req = makeReq(
      { tid: 'tid-1', returnCode: '00', status: 0 },
      { 'x-erede-secret': 'meu-secret-callback' },
    );
    const res = makeRes();
    const next = makeNext();

    await paymentController.eredeCallback(req, res, next);

    expect(paymentService.processGatewayCallback).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);

    delete process.env.EREDE_CALLBACK_SECRET;
  });
});
