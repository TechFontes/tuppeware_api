import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';

// We need fresh instances for each test to reset counters
const createApp = (maxRequests = 3, windowMs = 60_000) => {
  // Set env vars before importing
  process.env.RATE_LIMIT_MAX_REQUESTS = String(maxRequests);
  process.env.RATE_LIMIT_WINDOW_MS = String(windowMs);

  const app = express();

  // Simulate authenticated user
  app.use((req: any, _res: any, next: any) => {
    req.user = { id: 'user-1', role: 'CONSULTOR', email: 'x@x.com' };
    next();
  });

  // We can't easily re-import the module due to singleton behavior,
  // so we create a fresh rateLimit instance with the same config
  const rateLimit = require('express-rate-limit').default;

  const limiter = rateLimit({
    windowMs,
    max: maxRequests,
    keyGenerator: (req: any) => (req.user ? req.user.id : req.ip || ''),
    message: {
      status: 'fail',
      message: 'Limite de requisições atingido. Tente novamente em alguns minutos.',
    },
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.post('/test', limiter, (_req: any, res: any) => {
    res.json({ status: 'success' });
  });

  return app;
};

describe('rateLimitMiddleware — paymentLinkRateLimiter', () => {
  it('permite requisições dentro do limite', async () => {
    const app = createApp(3);
    const agent = request(app);

    const res = await agent.post('/test');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
  });

  it('bloqueia após atingir o limite de requisições', async () => {
    const app = createApp(2);
    const agent = request(app);

    // Primeira e segunda — OK
    await agent.post('/test').expect(200);
    await agent.post('/test').expect(200);

    // Terceira — bloqueada
    const res = await agent.post('/test');
    expect(res.status).toBe(429);
    expect(res.body.status).toBe('fail');
    expect(res.body.message).toContain('Limite de requisições');
  });

  it('retorna headers RateLimit padrão', async () => {
    const app = createApp(5);
    const agent = request(app);

    const res = await agent.post('/test');
    expect(res.status).toBe(200);
    // standardHeaders: true → RateLimit-Limit header
    expect(res.headers['ratelimit-limit']).toBeDefined();
  });

  it('usa userId como chave quando usuário autenticado', async () => {
    const app = express();
    const rateLimit = require('express-rate-limit').default;

    const limiter = rateLimit({
      windowMs: 60_000,
      max: 1,
      keyGenerator: (req: any) => (req.user ? req.user.id : req.ip || ''),
      message: { status: 'fail', message: 'Bloqueado' },
    });

    // Dois usuários diferentes — cada um tem seu próprio limite
    app.post(
      '/test',
      (req: any, _res: any, next: any) => {
        req.user = { id: req.headers['x-user-id'] || 'default' };
        next();
      },
      limiter,
      (_req: any, res: any) => {
        res.json({ status: 'success' });
      },
    );

    const agent = request(app);

    // User A: 1 request → OK
    await agent.post('/test').set('x-user-id', 'user-a').expect(200);
    // User A: 2nd request → blocked
    await agent.post('/test').set('x-user-id', 'user-a').expect(429);
    // User B: 1st request → OK (different key)
    await agent.post('/test').set('x-user-id', 'user-b').expect(200);
  });
});

describe('rateLimitMiddleware — globalRateLimiter config', () => {
  it('globalRateLimiter é exportado e é uma função middleware', async () => {
    const { globalRateLimiter } = await import('../../../middlewares/rateLimitMiddleware');
    expect(typeof globalRateLimiter).toBe('function');
  });

  it('paymentLinkRateLimiter é exportado e é uma função middleware', async () => {
    const { paymentLinkRateLimiter } = await import('../../../middlewares/rateLimitMiddleware');
    expect(typeof paymentLinkRateLimiter).toBe('function');
  });
});
