import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';

describe('config/auth — JWT_SECRET validation', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset module registry before each test
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('usa JWT_SECRET do ambiente quando definido', async () => {
    process.env.JWT_SECRET = 'meu-secret-seguro';
    process.env.NODE_ENV = 'production';
    const { jwtSecret } = await import('../../../config/auth');
    expect(jwtSecret).toBe('meu-secret-seguro');
  });

  it('lança erro em produção quando JWT_SECRET não está definido', async () => {
    delete process.env.JWT_SECRET;
    process.env.NODE_ENV = 'production';
    await expect(import('../../../config/auth')).rejects.toThrow('JWT_SECRET');
  });

  it('não lança erro em ambiente de test sem JWT_SECRET', async () => {
    delete process.env.JWT_SECRET;
    process.env.NODE_ENV = 'test';
    await expect(import('../../../config/auth')).resolves.toBeDefined();
  });
});
