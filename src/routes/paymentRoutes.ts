import { Router, Request, Response, NextFunction } from 'express';
import paymentController from '../controllers/PaymentController';
import { authMiddleware } from '../middlewares/authMiddleware';
import { paymentLinkRateLimiter } from '../middlewares/rateLimitMiddleware';
import { createPaymentValidator } from '../validators/paymentValidator';
import { validate } from '../validators/validationMiddleware';
import partialPaymentValidator from '../validators/partialPaymentValidator';

const router = Router();

/**
 * @swagger
 * /payments/callback/erede:
 *   post:
 *     tags: [Payments]
 *     summary: Callback assíncrono da eRede
 *     description: Endpoint usado pela eRede para atualização de status da transação.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               tid:
 *                 type: string
 *               returnCode:
 *                 type: string
 *               status:
 *                 type: number
 *               reference:
 *                 type: string
 *               amount:
 *                 type: number
 *     responses:
 *       200:
 *         description: Callback processado
 *       400:
 *         description: Payload inválido
 */
router.post('/callback/erede', (req: Request, res: Response, next: NextFunction) =>
  paymentController.eredeCallback(req, res, next),
);

// Todas as rotas de pagamentos requerem autenticação
router.use(authMiddleware);

/**
 * @swagger
 * /payments:
 *   post:
 *     tags: [Payments]
 *     summary: Criar pagamento
 *     description: |
 *       Cria um pagamento e envia transação para a eRede.
 *
 *       **Regras de parcelamento (cartão de crédito):**
 *       - Abaixo de R$ 300: apenas à vista
 *       - R$ 300 a R$ 499,99: até 2 parcelas
 *       - A partir de R$ 500: até 3 parcelas
 *
 *       **Taxa de cartão:** 5% sobre o subtotal.
 *       **PIX:** Sem parcelamento e sem taxas. Retorna qrCode (string EMV) e checkoutUrl (imagem QR).
 *       **Cartão:** Aprovação síncrona, sem redirect.
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
 *         description: Pagamento processado com sucesso
 *       502:
 *         description: Falha de integração com o gateway
 *       400:
 *         description: Dados inválidos ou regra de negócio violada
 *       401:
 *         description: Não autenticado
 *       429:
 *         description: Limite de links ativos atingido
 */
router.post(
  '/',
  paymentLinkRateLimiter,
  createPaymentValidator,
  validate,
  (req: Request, res: Response, next: NextFunction) => paymentController.create(req, res, next),
);

router.post(
  '/partial',
  paymentLinkRateLimiter,
  partialPaymentValidator,
  (req: Request, res: Response, next: NextFunction) => paymentController.createPartial(req, res, next),
);

export default router;
