import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

const loadConfig = async () => {
  vi.resetModules();
  return await import('../../../config/erede');
};

beforeEach(() => {
  delete process.env.EREDE_API_URL;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('config/erede — eredeApiUrl defaults', () => {
  it('usa sandbox /v2/transactions quando NODE_ENV != production', async () => {
    process.env.NODE_ENV = 'development';
    const cfg = await loadConfig();
    expect(cfg.eredeApiUrl).toBe('https://sandbox-erede.useredecloud.com.br/v2/transactions');
  });

  it('usa produção /erede/v2/transactions quando NODE_ENV=production', async () => {
    process.env.NODE_ENV = 'production';
    const cfg = await loadConfig();
    expect(cfg.eredeApiUrl).toBe('https://api.userede.com.br/erede/v2/transactions');
  });

  it('respeita EREDE_API_URL quando definida (override explícito)', async () => {
    process.env.NODE_ENV = 'production';
    process.env.EREDE_API_URL = 'https://custom.example.com/v1/transactions';
    const cfg = await loadConfig();
    expect(cfg.eredeApiUrl).toBe('https://custom.example.com/v1/transactions');
  });

  it('default da sandbox NÃO contém segmento "/rede/v1/" (path antigo de bucket S3)', async () => {
    process.env.NODE_ENV = 'test';
    const cfg = await loadConfig();
    expect(cfg.eredeApiUrl).not.toContain('/rede/v1/');
  });
});
