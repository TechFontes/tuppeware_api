import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

vi.mock('../../../repositories/SettingsRepository', () => ({
  default: { getAll: vi.fn() },
}));

import webhookDispatcher from '../../../services/WebhookDispatcher';
import settingsRepository from '../../../repositories/SettingsRepository';

const mkEvent = () => ({
  eventId: 'evt-1',
  eventType: 'payment.confirmed' as const,
  paymentType: 'PARTIAL' as const,
  timestamp: '2026-04-22T18:30:00.000Z',
  payment: { id: 'p-1', referenceNum: 'TPW-1', method: 'PIX', amount: 40, paidAt: '2026-04-22T18:30:00.000Z' },
  debt: { id: 'd-1', codigo: '1234', valor: 100, paidAmount: 40, remaining: 60, status: 'PENDENTE' as const },
  user: { id: 'u-1', cpf: '12345678900' },
});

describe('WebhookDispatcher', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers();
    vi.mocked(settingsRepository.getAll).mockResolvedValue({
      payment_webhook_url: 'https://example.com/hook',
      payment_webhook_secret: 'secret-with-16-chars!!',
    });
  });

  it('envia POST com assinatura HMAC-SHA256 correta', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    (globalThis as any).fetch = fetchMock;

    await webhookDispatcher.send(mkEvent());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://example.com/hook');
    expect(opts.method).toBe('POST');
    expect(opts.headers['Content-Type']).toBe('application/json');
    expect(opts.headers['X-Tuppeware-Event']).toBe('payment.confirmed');
    expect(opts.headers['X-Tuppeware-Event-Id']).toBe('evt-1');
    expect(opts.headers['X-Tuppeware-Signature']).toMatch(/^sha256=[a-f0-9]{64}$/);

    const timestamp = opts.headers['X-Tuppeware-Timestamp'];
    const expected = crypto
      .createHmac('sha256', 'secret-with-16-chars!!')
      .update(`${timestamp}.${opts.body}`)
      .digest('hex');
    expect(opts.headers['X-Tuppeware-Signature']).toBe(`sha256=${expected}`);
  });

  it('no-op quando URL ausente', async () => {
    vi.mocked(settingsRepository.getAll).mockResolvedValue({ payment_webhook_url: '', payment_webhook_secret: 'x'.repeat(16) });
    const fetchMock = vi.fn();
    (globalThis as any).fetch = fetchMock;

    await webhookDispatcher.send(mkEvent());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('aborta quando secret ausente (log warn)', async () => {
    vi.mocked(settingsRepository.getAll).mockResolvedValue({ payment_webhook_url: 'https://x.com/h' });
    const fetchMock = vi.fn();
    (globalThis as any).fetch = fetchMock;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await webhookDispatcher.send(mkEvent());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('retry 3x em 5xx com backoff', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: false, status: 502 })
      .mockResolvedValueOnce({ ok: true, status: 200 });
    (globalThis as any).fetch = fetchMock;

    const promise = webhookDispatcher.send(mkEvent());
    await vi.advanceTimersByTimeAsync(15_000);
    await promise;

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('desiste após 3 falhas e loga erro (não lança)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    (globalThis as any).fetch = fetchMock;
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const promise = webhookDispatcher.send(mkEvent());
    await vi.advanceTimersByTimeAsync(15_000);
    await expect(promise).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(errorSpy).toHaveBeenCalled();
  });
});
