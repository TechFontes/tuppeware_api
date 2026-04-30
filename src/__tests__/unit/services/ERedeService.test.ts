import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

beforeEach(() => {
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

describe('ERedeService.queryTransaction', () => {
  beforeEach(() => {
    process.env.EREDE_CLIENT_ID = 'test-client';
    process.env.EREDE_CLIENT_SECRET = 'test-secret';
    process.env.EREDE_OAUTH_URL = 'https://oauth.test/oauth2/token';
    process.env.EREDE_API_URL = 'https://api.test/v2/transactions';
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  it('retorna dados da transação quando consulta bem-sucedida', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(json({ access_token: 'tok', expires_in: 1439 }))
      .mockResolvedValueOnce(json({
        tid: 'tid-123', returnCode: '00', returnMessage: 'OK',
        status: 0, amount: 15000, reference: 'TPW-ref-1',
      })));

    const svc = await getService();
    const result = await svc.queryTransaction('tid-123');

    expect(result.tid).toBe('tid-123');
    expect(result.returnCode).toBe('00');
    expect(result.amount).toBe(15000);
  });

  it('lança AppError quando consulta retorna 4xx', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(json({ access_token: 'tok', expires_in: 1439 }))
      .mockResolvedValueOnce(json({ returnMessage: 'TID não encontrado' }, 404)));

    const svc = await getService();
    await expect(svc.queryTransaction('tid-invalido'))
      .rejects.toMatchObject({ message: expect.stringContaining('TID não encontrado') });
  });

  it('lança AppError 504 em timeout', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      return Promise.reject(err);
    }));

    const svc = await getService();
    await expect(svc.queryTransaction('tid-timeout'))
      .rejects.toMatchObject({ statusCode: 504 });
  });

  it('lança AppError 503 em erro genérico de rede', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(json({ access_token: 'tok', expires_in: 1439 }))
      .mockRejectedValueOnce(new Error('ECONNREFUSED')));

    const svc = await getService();
    await expect(svc.queryTransaction('tid-err'))
      .rejects.toMatchObject({ statusCode: 503 });
  });
});

describe('ERedeService.buildCreditPayload — campos adicionais', () => {
  it('constrói payload com amount, installments, cardNumber e zipCode corretos', async () => {
    const svc = await getService();

    const payload = svc.buildCreditPayload({
      reference: 'TPW-ref-1',
      amountCents: 30000,
      installments: 2,
      card: { number: '4111111111111111', expMonth: '12', expYear: '2028', cvv: '123', holderName: 'Test User' },
      billing: { name: 'Test', document: '11144477735', email: 't@t.com', address: 'Rua A', address2: 'Apto 1', district: 'Centro', city: 'SP', state: 'SP', postalcode: '01001000' },
    }) as any;

    expect(payload.kind).toBe('credit');
    expect(payload.amount).toBe(30000);
    expect(payload.installments).toBe(2);
    expect(payload.cardNumber).toBe('4111111111111111');
    expect(payload.billing.address.zipCode).toBe('01001000');
    expect(payload.billing.address.country).toBe('BRA');
  });

  it('normaliza país BR para BRA no billing', async () => {
    const svc = await getService();

    const payload = svc.buildCreditPayload({
      reference: 'ref',
      amountCents: 10000,
      installments: 1,
      card: { number: '4111111111111111', expMonth: '12', expYear: '2028', cvv: '123', holderName: 'Test' },
      billing: { name: 'T', document: '111', email: 't@t.com', address: 'R', district: 'D', city: 'C', state: 'SP', postalcode: '00000000', country: 'BR' },
    }) as any;

    expect(payload.billing.address.country).toBe('BRA');
  });
});


describe('ERedeService.validateCallbackSignature — com secret configurado', () => {
  afterEach(() => {
    delete process.env.EREDE_CALLBACK_SECRET;
    vi.unstubAllGlobals();
  });

  it('retorna true quando EREDE_CALLBACK_SECRET está configurado e payload é válido', async () => {
    process.env.EREDE_CALLBACK_SECRET = 'my-secret';
    const svc = await getService();

    const result = svc.validateCallbackSignature({
      tid: 'tid-123',
      returnCode: '00',
      status: 0,
      reference: 'TPW-1',
      amount: 1000,
    });

    expect(result).toBe(true);
  });
});

describe('ERedeService.buildCreditPayload — com cardToken', () => {
  it('usa cardToken em vez de cardNumber quando token fornecido', async () => {
    const svc = await getService();
    const payload = svc.buildCreditPayload({
      reference: 'TPW-ref-tok',
      amountCents: 15000,
      installments: 1,
      card: { number: '', expMonth: '12', expYear: '2028', cvv: '123', holderName: 'TEST' },
      billing: { name: 'T', document: '111', email: 't@t.com', address: 'R', district: 'D', city: 'C', state: 'SP', postalcode: '00000' },
      cardToken: 'tok_abc123',
    }) as any;

    expect(payload.cardToken).toBe('tok_abc123');
    expect(payload.cardNumber).toBeUndefined();
  });

  it('mantém cardNumber quando cardToken não fornecido', async () => {
    const svc = await getService();
    const payload = svc.buildCreditPayload({
      reference: 'TPW-ref-num',
      amountCents: 15000,
      installments: 1,
      card: { number: '4111111111111111', expMonth: '12', expYear: '2028', cvv: '123', holderName: 'TEST' },
      billing: { name: 'T', document: '111', email: 't@t.com', address: 'R', district: 'D', city: 'C', state: 'SP', postalcode: '00000' },
    }) as any;

    expect(payload.cardNumber).toBe('4111111111111111');
    expect(payload.cardToken).toBeUndefined();
  });
});

describe('ERedeService.tokenizeCardCofre', () => {
  beforeEach(() => {
    process.env.EREDE_CLIENT_ID = 'test-client';
    process.env.EREDE_CLIENT_SECRET = 'test-secret';
    process.env.EREDE_OAUTH_URL = 'https://oauth.test/oauth2/token';
    process.env.EREDE_TOKEN_SERVICE_URL = 'https://api.test/token-service/oauth/v2';
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  const cardData = {
    email: 'user@test.com',
    cardNumber: '5448280000000007',
    expirationMonth: '12',
    expirationYear: '2030',
    cardholderName: 'TESTE',
  };

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  it('chama POST /tokenization com Bearer + Affiliation', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ access_token: 'tok-bearer', expires_in: 1439 }))
      .mockResolvedValueOnce(json({ tokenizationId: 'tok-uuid-123' }, 201));
    vi.stubGlobal('fetch', fetchMock);

    const svc = await getService();
    const result = await svc.tokenizeCardCofre(cardData);

    expect(result.tokenizationId).toBe('tok-uuid-123');
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe('https://api.test/token-service/oauth/v2/tokenization');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer tok-bearer');
    expect(init.headers.Affiliation).toBe('test-client');
  });

  it('lança AppError 502 quando Rede retorna content-type não-JSON', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(json({ access_token: 'tok', expires_in: 1439 }))
      .mockResolvedValueOnce(new Response('<?xml version="1.0"?><error/>', {
        status: 403,
        headers: { 'content-type': 'application/xml' },
      })));

    const svc = await getService();
    await expect(svc.tokenizeCardCofre(cardData))
      .rejects.toMatchObject({ statusCode: 502, message: expect.stringContaining('não-JSON') });
  });

  it('retry em 401: invalida token e tenta 1x mais', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ access_token: 'tok-old', expires_in: 1439 }))
      .mockResolvedValueOnce(json({ error: 'unauthorized' }, 401))
      .mockResolvedValueOnce(json({ access_token: 'tok-new', expires_in: 1439 }))
      .mockResolvedValueOnce(json({ tokenizationId: 'after-retry' }, 201));
    vi.stubGlobal('fetch', fetchMock);

    const svc = await getService();
    const result = await svc.tokenizeCardCofre(cardData);

    expect(result.tokenizationId).toBe('after-retry');
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('lança AppError com returnMessage da Rede quando 4xx com payload', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(json({ access_token: 'tok', expires_in: 1439 }))
      .mockResolvedValueOnce(json({ returnMessage: 'Cartão inválido', returnCode: '99' }, 400)));

    const svc = await getService();
    await expect(svc.tokenizeCardCofre(cardData))
      .rejects.toMatchObject({ message: expect.stringContaining('Cartão inválido') });
  });

  it('lança AppError 502 quando 5xx', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(json({ access_token: 'tok', expires_in: 1439 }))
      .mockResolvedValueOnce(json({ error: 'server' }, 503)));

    const svc = await getService();
    await expect(svc.tokenizeCardCofre(cardData))
      .rejects.toMatchObject({ statusCode: 502 });
  });

  it('inclui securityCode no body quando fornecido', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ access_token: 'tok', expires_in: 1439 }))
      .mockResolvedValueOnce(json({ tokenizationId: 'id' }, 201));
    vi.stubGlobal('fetch', fetchMock);

    const svc = await getService();
    await svc.tokenizeCardCofre({ ...cardData, securityCode: '123' });

    const body = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(body.securityCode).toBe('123');
  });

  it('lança AppError 502 quando resposta sem tokenizationId', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(json({ access_token: 'tok', expires_in: 1439 }))
      .mockResolvedValueOnce(json({ /* missing tokenizationId */ }, 201)));

    const svc = await getService();
    await expect(svc.tokenizeCardCofre(cardData))
      .rejects.toMatchObject({
        statusCode: 502,
        message: expect.stringContaining('tokenizationId'),
      });
  });

  it('lança AppError 502 quando tokenizationId é string vazia', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(json({ access_token: 'tok', expires_in: 1439 }))
      .mockResolvedValueOnce(json({ tokenizationId: '' }, 201)));

    const svc = await getService();
    await expect(svc.tokenizeCardCofre(cardData))
      .rejects.toMatchObject({ statusCode: 502 });
  });

  it('envia storageCard=2 (multiple use) por default no body', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ access_token: 'tok', expires_in: 1439 }))
      .mockResolvedValueOnce(json({ tokenizationId: 'tok-uuid' }, 201));
    vi.stubGlobal('fetch', fetchMock);

    const svc = await getService();
    await svc.tokenizeCardCofre(cardData);

    const sentBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(sentBody.storageCard).toBe(2);
  });
});

describe('ERedeService.createTransaction', () => {
  beforeEach(() => {
    process.env.EREDE_CLIENT_ID = 'test-client';
    process.env.EREDE_CLIENT_SECRET = 'test-secret';
    process.env.EREDE_OAUTH_URL = 'https://oauth.test/oauth2/token';
    process.env.EREDE_API_URL = 'https://api.test/v2/transactions';
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  it('retorna resposta parseada em caso de sucesso PIX (Bearer + Affiliation)', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ access_token: 'tok', expires_in: 1439 }))
      .mockResolvedValueOnce(json({
        tid: 'tid-123', returnCode: '00', returnMessage: 'Aprovado', reference: 'TPW-1',
        pix: { qrCode: '00020126...', link: 'https://pix.link/qr', expirationDate: '2026-04-02T10:00:00Z' },
      }));
    vi.stubGlobal('fetch', fetchMock);

    const svc = await getService();
    const result = await svc.createTransaction(svc.buildPixPayload('TPW-1', 15000));

    expect(result.returnCode).toBe('00');
    expect(result.pix?.qrCode).toBe('00020126...');
    const init = fetchMock.mock.calls[1][1];
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(init.headers.Affiliation).toBe('test-client');
  });

  it('extrai cardBin, brandTid, transactionLinkId quando presentes (cobrança v2)', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(json({ access_token: 'tok', expires_in: 1439 }))
      .mockResolvedValueOnce(json({
        tid: 'tid-123', returnCode: '00', returnMessage: 'OK', reference: 'TPW-1',
        cardBin: '544828', brandTid: 'btid-99', transactionLinkId: 'link-abc',
      })));

    const svc = await getService();
    const result = await svc.createTransaction(svc.buildPixPayload('TPW-1', 1000));

    expect(result.cardBin).toBe('544828');
    expect(result.brandTid).toBe('btid-99');
    expect(result.transactionLinkId).toBe('link-abc');
  });

  it('lança AppError quando gateway retorna 4xx com returnMessage', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(json({ access_token: 'tok', expires_in: 1439 }))
      .mockResolvedValueOnce(json({ returnMessage: 'Cartão inválido' }, 400)));

    const svc = await getService();
    await expect(svc.createTransaction(svc.buildPixPayload('TPW-1', 1000)))
      .rejects.toMatchObject({ message: expect.stringContaining('Cartão inválido') });
  });

  it('lança AppError 504 em timeout', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      return Promise.reject(error);
    }));

    const svc = await getService();
    await expect(svc.createTransaction(svc.buildPixPayload('TPW-1', 1000)))
      .rejects.toMatchObject({ statusCode: 504 });
  });

  it('lança AppError 500 quando EREDE_CLIENT_ID ausente', async () => {
    delete process.env.EREDE_CLIENT_ID;
    vi.resetModules();
    const mod = await import('../../../services/ERedeService');
    await expect(mod.default.createTransaction({ kind: 'pix', reference: 'TPW-1', amount: 1000, expirationDate: '' }))
      .rejects.toMatchObject({ statusCode: 500 });
  });

  it('lança AppError 503 em erro genérico de rede (ECONNREFUSED)', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(json({ access_token: 'tok', expires_in: 1439 }))
      .mockRejectedValueOnce(new Error('ECONNREFUSED')));

    const svc = await getService();
    await expect(svc.createTransaction(svc.buildPixPayload('TPW-1', 1000)))
      .rejects.toMatchObject({ statusCode: 503 });
  });
});

describe('ERedeService.queryTokenization', () => {
  beforeEach(() => {
    process.env.EREDE_CLIENT_ID = 'test-client';
    process.env.EREDE_CLIENT_SECRET = 'test-secret';
    process.env.EREDE_OAUTH_URL = 'https://oauth.test/oauth2/token';
    process.env.EREDE_TOKEN_SERVICE_URL = 'https://api.test/token-service/oauth/v2';
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  it('faz GET /tokenization/{id} e mapeia o formato real da v2 (brand como objeto, last4 sem suffix)', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(json({ access_token: 'tok', expires_in: 1439 }))
      .mockResolvedValueOnce(json({
        tokenizationId: 'tok-uuid',
        tokenizationStatus: 'Active',
        bin: '544828',
        last4: '0007',
        brand: { name: 'Mastercard', tokenStatus: 'Pending', brandTid: '601486334267364' },
        lastModifiedDate: '2026-04-30T12:00:00-03:00',
      })));

    const svc = await getService();
    const result = await svc.queryTokenization('tok-uuid');

    expect(result.tokenizationId).toBe('tok-uuid');
    expect(result.status).toBe('ACTIVE');
    expect(result.bin).toBe('544828');
    expect(result.last4).toBe('0007');
    expect(result.brand).toBe('Mastercard');
    expect(result.brandTid).toBe('601486334267364');
  });

  it('mapeia "Suspended" para INACTIVE', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(json({ access_token: 'tok', expires_in: 1439 }))
      .mockResolvedValueOnce(json({ tokenizationId: 'x', tokenizationStatus: 'Suspended' })));

    const svc = await getService();
    const result = await svc.queryTokenization('x');

    expect(result.status).toBe('INACTIVE');
  });

  it('mapeia "Pending" para PENDING', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(json({ access_token: 'tok', expires_in: 1439 }))
      .mockResolvedValueOnce(json({ tokenizationId: 'x', tokenizationStatus: 'Pending' })));

    const svc = await getService();
    const result = await svc.queryTokenization('x');

    expect(result.status).toBe('PENDING');
  });

  it('mapeia "Failed" para FAILED', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(json({ access_token: 'tok', expires_in: 1439 }))
      .mockResolvedValueOnce(json({ tokenizationId: 'x', tokenizationStatus: 'Failed' })));

    const svc = await getService();
    const result = await svc.queryTokenization('x');

    expect(result.status).toBe('FAILED');
  });

  it('lança AppError quando 404', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(json({ access_token: 'tok', expires_in: 1439 }))
      .mockResolvedValueOnce(json({ returnMessage: 'Tokenization not found' }, 404)));

    const svc = await getService();
    await expect(svc.queryTokenization('nope'))
      .rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('ERedeService.buildCreditPayload — Cofre completo', () => {
  it('omite cardNumber, cardHolderName, expirationMonth e expirationYear quando cardToken presente', async () => {
    const svc = await getService();
    const payload = svc.buildCreditPayload({
      reference: 'TPW-cofre',
      amountCents: 10000,
      installments: 1,
      card: { number: 'IGNORE', expMonth: 'IGNORE', expYear: 'IGNORE', cvv: '123', holderName: 'IGNORE' },
      billing: { name: 'T', document: '111', email: 't@t.com', address: 'R', district: 'D', city: 'C', state: 'SP', postalcode: '00000' },
      cardToken: 'tok-cofre-123',
    }) as any;

    expect(payload.cardToken).toBe('tok-cofre-123');
    expect(payload.cardNumber).toBeUndefined();
    expect(payload.cardHolderName).toBeUndefined();
    expect(payload.expirationMonth).toBeUndefined();
    expect(payload.expirationYear).toBeUndefined();
    expect(payload.securityCode).toBe('123'); // CVV mantido
  });

  it('mantém cardNumber, cardHolderName, expirationMonth e expirationYear quando sem cardToken', async () => {
    const svc = await getService();
    const payload = svc.buildCreditPayload({
      reference: 'TPW-direto',
      amountCents: 10000,
      installments: 1,
      card: { number: '4111111111111111', expMonth: '12', expYear: '2028', cvv: '123', holderName: 'TESTE' },
      billing: { name: 'T', document: '111', email: 't@t.com', address: 'R', district: 'D', city: 'C', state: 'SP', postalcode: '00000' },
    }) as any;

    expect(payload.cardNumber).toBe('4111111111111111');
    expect(payload.cardHolderName).toBe('TESTE');
    expect(payload.expirationMonth).toBe('12');
    expect(payload.expirationYear).toBe('2028');
    expect(payload.cardToken).toBeUndefined();
  });
});

describe('ERedeService.manageTokenization', () => {
  beforeEach(() => {
    process.env.EREDE_CLIENT_ID = 'test-client';
    process.env.EREDE_CLIENT_SECRET = 'test-secret';
    process.env.EREDE_OAUTH_URL = 'https://oauth.test/oauth2/token';
    process.env.EREDE_TOKEN_SERVICE_URL = 'https://api.test/token-service/oauth/v2';
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  it('faz POST /tokenization/{id}/management com action=delete', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ access_token: 'tok', expires_in: 1439 }))
      .mockResolvedValueOnce(json({ returnCode: '00', returnMessage: 'OK' }));
    vi.stubGlobal('fetch', fetchMock);

    const svc = await getService();
    const result = await svc.manageTokenization('tok-id', 'delete', 1);

    expect(result.returnCode).toBe('00');
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toContain('/tokenization/tok-id/management');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(body.action).toBe('delete');
    expect(body.reason).toBe(1);
  });

  it('omite reason quando não fornecido', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ access_token: 'tok', expires_in: 1439 }))
      .mockResolvedValueOnce(json({ returnCode: '00', returnMessage: 'OK' }));
    vi.stubGlobal('fetch', fetchMock);

    const svc = await getService();
    await svc.manageTokenization('tok-id', 'delete');

    const body = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(body.reason).toBeUndefined();
  });
});
