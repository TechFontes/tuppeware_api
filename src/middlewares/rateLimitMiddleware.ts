import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { Request } from 'express';

/**
 * Rate limiter para geração de links de pagamento.
 * Máximo de 5 requisições por usuário a cada 5 minutos.
 */
const paymentLinkRateLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '') || 5 * 60 * 1000, // 5 minutos
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '') || 5,
  keyGenerator: (req: Request) => {
    return req.user ? req.user.id : ipKeyGenerator(req.ip || '');
  },
  message: {
    status: 'fail',
    message: 'Limite de requisições atingido. Tente novamente em alguns minutos.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Rate limiter global da API.
 * Máximo de 100 requisições por IP a cada 15 minutos.
 */
const globalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100,
  message: {
    status: 'fail',
    message: 'Muitas requisições. Tente novamente mais tarde.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export { paymentLinkRateLimiter, globalRateLimiter };
