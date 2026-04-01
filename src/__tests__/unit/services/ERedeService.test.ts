import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

beforeEach(() => {
  process.env.EREDE_PV = 'test-pv';
  process.env.EREDE_INTEGRATION_KEY = 'test-key';
  process.env.EREDE_PIX_EXPIRATION_HOURS = '24';
  process.env.EREDE_SOFT_DESCRIPTOR = 'TUPPEWARE-TEST';
});

const getService = async () => {
  vi.resetModules();
  const mod = await import('../../../services/ERedeService');
  return mod.default;
};

describe('ERedeService.buildPixPayload', () => {
  it('retorna payload com kind=pix e campos corretos', async () => {
    const svc = await getService();
    const payload = svc.buildPixPayload('TPW-123-abcd1234', 15000);
    expect(payload.kind).toBe('pix');
    expect(payload.reference).toBe('TPW-123-abcd1234');
    expect(payload.amount).toBe(15000);
    expect(payload.expirationDate).toBeDefined();
  });

  it('data de expiração está no futuro', async () => {
    const svc = await getService();
    const before = Date.now();
    const payload = svc.buildPixPayload('TPW-1', 1000);
    const expiration = new Date(payload.expirationDate!).getTime();
    expect(expiration).toBeGreaterThan(before);
  });
});

describe('ERedeService.buildCreditPayload', () => {
  const baseParams = {
    reference: 'TPW-123-abcd1234',
    amountCents: 52500,
    installments: 2,
    card: { number: '4111111111111111', expMonth: '12', expYear: '2028', cvv: '123', holderName: 'JOAO DA SILVA' },
    billing: { name: 'Joao da Silva', document: '111.444.777-35', email: 'joao@email.com', address: 'Rua Exemplo', district: 'Centro', city: 'São Paulo', state: 'SP', postalcode: '01310100' },
  };

  it('retorna kind=credit', async () => {
    const svc = await getService();
    expect(svc.buildCreditPayload(baseParams).kind).toBe('credit');
  });

  it('remove caracteres não-numéricos do documento', async () => {
    const svc = await getService();
    const payload = svc.buildCreditPayload(baseParams) as any;
    expect(payload.billing.document).toBe('11144477735');
  });

  it('converte país ausente para BRA', async () => {
    const svc = await getService();
    const payload = svc.buildCreditPayload(baseParams) as any;
    expect(payload.billing.address.country).toBe('BRA');
  });

  it('converte US para USA', async () => {
    const svc = await getService();
    const payload = svc.buildCreditPayload({ ...baseParams, billing: { ...baseParams.billing, country: 'US' } }) as any;
    expect(payload.billing.address.country).toBe('USA');
  });

  it('usa capture=true', async () => {
    const svc = await getService();
    const payload = svc.buildCreditPayload(baseParams) as any;
    expect(payload.capture).toBe(true);
  });
});

describe('ERedeService.mapStatusToLocal', () => {
  it('returnCode "00" → PAGO', async () => {
    const svc = await getService();
    expect(svc.mapStatusToLocal('00')).toBe('PAGO');
  });

  it('webhookStatus 0 → PAGO', async () => {
    const svc = await getService();
    expect(svc.mapStatusToLocal('XX', 0)).toBe('PAGO');
  });

  it('webhookStatus 3 → PENDENTE', async () => {
    const svc = await getService();
    expect(svc.mapStatusToLocal('XX', 3)).toBe('PENDENTE');
  });

  it('webhookStatus 4 → CANCELADO', async () => {
    const svc = await getService();
    expect(svc.mapStatusToLocal('XX', 4)).toBe('CANCELADO');
  });

  it('returnCode desconhecido sem webhookStatus → CANCELADO', async () => {
    const svc = await getService();
    expect(svc.mapStatusToLocal('99')).toBe('CANCELADO');
  });

  it('returnCode "00" tem precedência sobre webhookStatus', async () => {
    const svc = await getService();
    expect(svc.mapStatusToLocal('00', 3)).toBe('PAGO');
  });
});

describe('ERedeService.validateCallbackSignature', () => {
  it('retorna true para payload válido', async () => {
    const svc = await getService();
    expect(svc.validateCallbackSignature({ tid: 'abc123', returnCode: '00', status: 0, reference: 'TPW-1', amount: 1000 })).toBe(true);
  });

  it('retorna false quando tid está vazio', async () => {
    const svc = await getService();
    expect(svc.validateCallbackSignature({ tid: '', returnCode: '00', status: 0, reference: 'TPW-1', amount: 1000 })).toBe(false);
  });

  it('retorna false quando returnCode é undefined', async () => {
    const svc = await getService();
    expect(svc.validateCallbackSignature({ tid: 'abc', returnCode: undefined as any, status: 0, reference: 'TPW-1', amount: 1000 })).toBe(false);
  });

  it('retorna false para payload null', async () => {
    const svc = await getService();
    expect(svc.validateCallbackSignature(null as any)).toBe(false);
  });
});

describe('ERedeService.createTransaction', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('retorna resposta parseada em caso de sucesso PIX', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        tid: 'tid-123', returnCode: '00', returnMessage: 'Aprovado', reference: 'TPW-1',
        pix: { qrCode: '00020126...', link: 'https://pix.link/qr', expirationDate: '2026-04-02T10:00:00Z' },
      }),
    }));
    const svc = await getService();
    const result = await svc.createTransaction(svc.buildPixPayload('TPW-1', 15000));
    expect(result.returnCode).toBe('00');
    expect(result.pix?.qrCode).toBe('00020126...');
  });

  it('lança AppError 502 quando gateway retorna erro', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ returnMessage: 'Cartão inválido' }),
    }));
    const svc = await getService();
    await expect(svc.createTransaction(svc.buildPixPayload('TPW-1', 1000)))
      .rejects.toMatchObject({ message: 'Cartão inválido', statusCode: 502 });
  });

  it('lança AppError 504 em timeout', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      const error = new Error('The operation was aborted');
      error.name = 'AbortError';
      return Promise.reject(error);
    }));
    const svc = await getService();
    await expect(svc.createTransaction(svc.buildPixPayload('TPW-1', 1000)))
      .rejects.toMatchObject({ statusCode: 504 });
  });

  it('lança AppError 500 quando credenciais não estão configuradas', async () => {
    delete process.env.EREDE_PV;
    delete process.env.EREDE_INTEGRATION_KEY;
    vi.resetModules();
    const mod = await import('../../../services/ERedeService');
    await expect(mod.default.createTransaction({ kind: 'pix', reference: 'TPW-1', amount: 1000, expirationDate: '' }))
      .rejects.toMatchObject({ statusCode: 500 });
  });
});
