import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';

beforeEach(() => {
  process.env.EREDE_CLIENT_ID = 'test-client';
  process.env.EREDE_CLIENT_SECRET = 'test-secret';
  process.env.EREDE_OAUTH_URL = 'https://oauth.test/oauth2/token';
  process.env.EREDE_TIMEOUT_MS = '15000';
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const getClient = async () => {
  vi.resetModules();
  const mod = await import('../../../services/EredeOAuthClient');
  return mod.default;
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

describe('EredeOAuthClient.getAccessToken', () => {
  it('faz POST /oauth2/token com Basic auth e grant_type=client_credentials', async () => {
    (fetch as Mock).mockResolvedValueOnce(jsonResponse({ access_token: 'tok-1', expires_in: 1439 }));
    const client = await getClient();

    const token = await client.getAccessToken();

    expect(token).toBe('tok-1');
    const [url, init] = (fetch as Mock).mock.calls[0];
    expect(url).toBe('https://oauth.test/oauth2/token');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toMatch(/^Basic /);
    const decoded = Buffer.from(init.headers.Authorization.replace('Basic ', ''), 'base64').toString();
    expect(decoded).toBe('test-client:test-secret');
    expect(init.body).toContain('grant_type=client_credentials');
  });

  it('retorna token cacheado em chamadas subsequentes (dentro da janela)', async () => {
    (fetch as Mock).mockResolvedValueOnce(jsonResponse({ access_token: 'tok-cached', expires_in: 1439 }));
    const client = await getClient();

    const t1 = await client.getAccessToken();
    const t2 = await client.getAccessToken();

    expect(t1).toBe('tok-cached');
    expect(t2).toBe('tok-cached');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('renova quando expires_at - 60s < now', async () => {
    (fetch as Mock)
      .mockResolvedValueOnce(jsonResponse({ access_token: 'tok-old', expires_in: 30 }))
      .mockResolvedValueOnce(jsonResponse({ access_token: 'tok-new', expires_in: 1439 }));
    const client = await getClient();

    const t1 = await client.getAccessToken();
    const t2 = await client.getAccessToken();

    expect(t1).toBe('tok-old');
    expect(t2).toBe('tok-new');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('dedupe: chamadas concorrentes resultam em 1 request', async () => {
    (fetch as Mock).mockImplementation(() =>
      new Promise((resolve) => setTimeout(() => resolve(jsonResponse({ access_token: 'tok-once', expires_in: 1439 })), 10)),
    );
    const client = await getClient();

    const [t1, t2, t3] = await Promise.all([
      client.getAccessToken(),
      client.getAccessToken(),
      client.getAccessToken(),
    ]);

    expect(t1).toBe('tok-once');
    expect(t2).toBe('tok-once');
    expect(t3).toBe('tok-once');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('invalidate() força nova chamada na próxima request', async () => {
    (fetch as Mock)
      .mockResolvedValueOnce(jsonResponse({ access_token: 'tok-1', expires_in: 1439 }))
      .mockResolvedValueOnce(jsonResponse({ access_token: 'tok-2', expires_in: 1439 }));
    const client = await getClient();

    const t1 = await client.getAccessToken();
    client.invalidate();
    const t2 = await client.getAccessToken();

    expect(t1).toBe('tok-1');
    expect(t2).toBe('tok-2');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('lança AppError 500 quando credenciais não configuradas', async () => {
    delete process.env.EREDE_CLIENT_ID;
    delete process.env.EREDE_CLIENT_SECRET;
    const client = await getClient();

    await expect(client.getAccessToken()).rejects.toMatchObject({ statusCode: 500 });
  });

  it('lança AppError 500 quando OAuth retorna 401', async () => {
    (fetch as Mock).mockResolvedValueOnce(jsonResponse({ error: 'invalid_client' }, 401));
    const client = await getClient();

    await expect(client.getAccessToken()).rejects.toMatchObject({
      statusCode: 500,
      message: expect.stringContaining('Credenciais'),
    });
  });

  it('lança AppError 503 quando OAuth retorna 5xx', async () => {
    (fetch as Mock).mockResolvedValueOnce(jsonResponse({ error: 'server_error' }, 503));
    const client = await getClient();

    await expect(client.getAccessToken()).rejects.toMatchObject({ statusCode: 503 });
  });

  it('lança AppError 504 em timeout (AbortError)', async () => {
    (fetch as Mock).mockImplementation(() => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      return Promise.reject(err);
    });
    const client = await getClient();

    await expect(client.getAccessToken()).rejects.toMatchObject({ statusCode: 504 });
  });

  it('lança AppError 503 em erro genérico de rede', async () => {
    (fetch as Mock).mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const client = await getClient();

    await expect(client.getAccessToken()).rejects.toMatchObject({ statusCode: 503 });
  });
});
