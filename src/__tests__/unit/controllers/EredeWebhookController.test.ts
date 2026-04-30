import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../repositories/EredeWebhookRepository', () => ({
  default: {
    findByExternalId: vi.fn(),
    create: vi.fn(),
    markProcessed: vi.fn(),
    markFailed: vi.fn(),
  },
}));

vi.mock('../../../services/EredeWebhookService', () => ({
  default: { syncTokenization: vi.fn(), syncTransaction: vi.fn() },
}));

import eredeWebhookController from '../../../controllers/EredeWebhookController';
import eredeWebhookRepository from '../../../repositories/EredeWebhookRepository';
import eredeWebhookService from '../../../services/EredeWebhookService';

const mockRes = () => {
  const res: any = { statusCode: 200, body: undefined };
  res.status = vi.fn().mockImplementation((code: number) => { res.statusCode = code; return res; });
  res.json = vi.fn().mockImplementation((b: any) => { res.body = b; return res; });
  return res;
};

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.EREDE_CALLBACK_SECRET;
});

afterEach(() => { delete process.env.EREDE_CALLBACK_SECRET; });

describe('EredeWebhookController.handle — validações', () => {
  it('rejeita 401 quando secret configurado e header diverge', async () => {
    process.env.EREDE_CALLBACK_SECRET = 'expected';
    const req: any = { headers: { 'x-erede-secret': 'wrong', 'request-id': 'r1' }, body: {} };
    const res = mockRes();

    await eredeWebhookController.handle(req, res, vi.fn());

    expect(res.statusCode).toBe(401);
  });

  it('aceita quando secret não configurado (sandbox)', async () => {
    vi.mocked(eredeWebhookRepository.findByExternalId).mockResolvedValueOnce(null);
    vi.mocked(eredeWebhookRepository.create).mockResolvedValueOnce({ id: 'e1' } as any);
    vi.mocked(eredeWebhookService.syncTokenization).mockResolvedValueOnce(undefined);
    vi.mocked(eredeWebhookRepository.markProcessed).mockResolvedValueOnce({ id: 'e1' } as any);

    const req: any = {
      headers: { 'request-id': 'r1' },
      body: { eventType: 'PV.TOKENIZACAO-BANDEIRA', tokenizationId: 'tok-uuid' },
    };
    const res = mockRes();

    await eredeWebhookController.handle(req, res, vi.fn());

    expect(res.statusCode).toBe(200);
  });

  it('rejeita 400 quando Request-ID ausente', async () => {
    const req: any = { headers: {}, body: { eventType: 'PV.TOKENIZACAO-X' } };
    const res = mockRes();

    await eredeWebhookController.handle(req, res, vi.fn());

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toContain('Request-ID');
  });

  it('rejeita 400 quando eventType desconhecido', async () => {
    const req: any = { headers: { 'request-id': 'r1' }, body: { eventType: 'UNKNOWN' } };
    const res = mockRes();

    await eredeWebhookController.handle(req, res, vi.fn());

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toContain('Evento');
  });
});

describe('EredeWebhookController.handle — idempotência', () => {
  it('duplicata processed=true → 200 com duplicate=true', async () => {
    vi.mocked(eredeWebhookRepository.findByExternalId).mockResolvedValueOnce({
      id: 'e1', processed: true,
    } as any);

    const req: any = {
      headers: { 'request-id': 'r1' },
      body: { eventType: 'PV.TOKENIZACAO-BANDEIRA', tokenizationId: 'tok' },
    };
    const res = mockRes();

    await eredeWebhookController.handle(req, res, vi.fn());

    expect(res.statusCode).toBe(200);
    expect(res.body.duplicate).toBe(true);
    expect(eredeWebhookService.syncTokenization).not.toHaveBeenCalled();
  });

  it('race condition: P2002 no create vira duplicate=true', async () => {
    vi.mocked(eredeWebhookRepository.findByExternalId).mockResolvedValueOnce(null);
    const p2002 = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    vi.mocked(eredeWebhookRepository.create).mockRejectedValueOnce(p2002);

    const req: any = {
      headers: { 'request-id': 'r1' },
      body: { eventType: 'PV.TOKENIZACAO-BANDEIRA', tokenizationId: 'tok' },
    };
    const res = mockRes();

    await eredeWebhookController.handle(req, res, vi.fn());

    expect(res.statusCode).toBe(200);
    expect(res.body.duplicate).toBe(true);
    expect(eredeWebhookService.syncTokenization).not.toHaveBeenCalled();
  });

  it('duplicata processed=false → re-tenta processar', async () => {
    vi.mocked(eredeWebhookRepository.findByExternalId).mockResolvedValueOnce({
      id: 'e1', processed: false,
    } as any);
    vi.mocked(eredeWebhookService.syncTokenization).mockResolvedValueOnce(undefined);
    vi.mocked(eredeWebhookRepository.markProcessed).mockResolvedValueOnce({ id: 'e1' } as any);

    const req: any = {
      headers: { 'request-id': 'r1' },
      body: { eventType: 'PV.TOKENIZACAO-BANDEIRA', tokenizationId: 'tok' },
    };
    const res = mockRes();

    await eredeWebhookController.handle(req, res, vi.fn());

    expect(eredeWebhookRepository.create).not.toHaveBeenCalled();
    expect(eredeWebhookService.syncTokenization).toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
  });
});

describe('EredeWebhookController.handle — dispatch e erros', () => {
  it('TOKENIZATION dispara syncTokenization e marca processed', async () => {
    vi.mocked(eredeWebhookRepository.findByExternalId).mockResolvedValueOnce(null);
    vi.mocked(eredeWebhookRepository.create).mockResolvedValueOnce({ id: 'e1' } as any);
    vi.mocked(eredeWebhookService.syncTokenization).mockResolvedValueOnce(undefined);
    vi.mocked(eredeWebhookRepository.markProcessed).mockResolvedValueOnce({ id: 'e1' } as any);

    const req: any = {
      headers: { 'request-id': 'r1' },
      body: { eventType: 'PV.TOKENIZACAO-BANDEIRA', tokenizationId: 'tok-1' },
    };
    const res = mockRes();

    await eredeWebhookController.handle(req, res, vi.fn());

    expect(eredeWebhookService.syncTokenization).toHaveBeenCalledWith('tok-1');
    expect(eredeWebhookRepository.markProcessed).toHaveBeenCalledWith('e1');
    expect(res.statusCode).toBe(200);
  });

  it('TRANSACAO dispara syncTransaction', async () => {
    vi.mocked(eredeWebhookRepository.findByExternalId).mockResolvedValueOnce(null);
    vi.mocked(eredeWebhookRepository.create).mockResolvedValueOnce({ id: 'e1' } as any);
    vi.mocked(eredeWebhookService.syncTransaction).mockResolvedValueOnce(undefined);
    vi.mocked(eredeWebhookRepository.markProcessed).mockResolvedValueOnce({ id: 'e1' } as any);

    const req: any = {
      headers: { 'request-id': 'r1' },
      body: { eventType: 'PV.TRANSACAO-AUTORIZADA', tid: 'tid-1' },
    };
    const res = mockRes();

    await eredeWebhookController.handle(req, res, vi.fn());

    expect(eredeWebhookService.syncTransaction).toHaveBeenCalledWith('tid-1');
  });

  it('falha no processamento → marca failed e responde 500', async () => {
    vi.mocked(eredeWebhookRepository.findByExternalId).mockResolvedValueOnce(null);
    vi.mocked(eredeWebhookRepository.create).mockResolvedValueOnce({ id: 'e1' } as any);
    vi.mocked(eredeWebhookService.syncTokenization).mockRejectedValueOnce(new Error('Timeout'));
    vi.mocked(eredeWebhookRepository.markFailed).mockResolvedValueOnce({ id: 'e1' } as any);

    const req: any = {
      headers: { 'request-id': 'r1' },
      body: { eventType: 'PV.TOKENIZACAO-BANDEIRA', tokenizationId: 'tok' },
    };
    const res = mockRes();

    await eredeWebhookController.handle(req, res, vi.fn());

    expect(eredeWebhookRepository.markFailed).toHaveBeenCalledWith('e1', expect.stringContaining('Timeout'));
    expect(res.statusCode).toBe(500);
  });

  it('payload sem tokenizationId em evento de TOKENIZACAO → marca failed', async () => {
    vi.mocked(eredeWebhookRepository.findByExternalId).mockResolvedValueOnce(null);
    vi.mocked(eredeWebhookRepository.create).mockResolvedValueOnce({ id: 'e1' } as any);
    vi.mocked(eredeWebhookRepository.markFailed).mockResolvedValueOnce({ id: 'e1' } as any);

    const req: any = {
      headers: { 'request-id': 'r1' },
      body: { eventType: 'PV.TOKENIZACAO-BANDEIRA' }, // sem tokenizationId
    };
    const res = mockRes();

    await eredeWebhookController.handle(req, res, vi.fn());

    expect(eredeWebhookRepository.markFailed).toHaveBeenCalled();
    expect(res.statusCode).toBe(500);
  });
});
