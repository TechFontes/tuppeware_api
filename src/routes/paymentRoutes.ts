import { Router, Request, Response, NextFunction } from 'express';
import paymentController from '../controllers/PaymentController';
import { authMiddleware } from '../middlewares/authMiddleware';
import { paymentLinkRateLimiter } from '../middlewares/rateLimitMiddleware';
import { createPaymentValidator } from '../validators/paymentValidator';
import { validate } from '../validators/validationMiddleware';

const router = Router();

// Todas as rotas de pagamentos requerem autenticação
router.use(authMiddleware);

/**
 * @swagger
 * /payments:
 *   post:
 *     tags: [Payments]
 *     summary: Criar pagamento
 *     description: |
 *       Cria um pagamento e gera link de pagamento via Asaas.
 *
 *       **Regras de parcelamento (cartão de crédito):**
 *       - Abaixo de R$ 300: apenas à vista
 *       - R$ 300 a R$ 499,99: até 2 parcelas
 *       - A partir de R$ 500: até 3 parcelas
 *
 *       **Taxa de cartão:** 5% sobre o subtotal.
 *       **PIX:** Sem parcelamento e sem taxas.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreatePaymentDTO'
 *     responses:
 *       201:
 *         description: Link de pagamento gerado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/Payment'
 *       400:
 *         description: Dados inválidos ou regra de negócio violada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Não autenticado
 *       429:
 *         description: Limite de requisições atingido
 */
router.post(
  '/',
  paymentLinkRateLimiter,
  createPaymentValidator,
  validate,
  (req: Request, res: Response, next: NextFunction) => paymentController.create(req, res, next),
);

export default router;
