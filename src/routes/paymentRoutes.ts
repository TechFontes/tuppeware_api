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
 *     security: []
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
 *           examples:
 *             pix_simples:
 *               summary: Pagamento PIX — débito único
 *               value:
 *                 debtIds: ["550e8400-e29b-41d4-a716-446655440001"]
 *                 method: PIX
 *                 billing:
 *                   name: "Maria Silva"
 *                   email: "maria@email.com"
 *                   phone: "11999999999"
 *                   document: "12345678901"
 *                   address: "Rua Exemplo, 100"
 *                   district: "Centro"
 *                   city: "São Paulo"
 *                   state: "SP"
 *                   postalcode: "01001000"
 *                   country: "BR"
 *             cartao_credito:
 *               summary: Pagamento com cartão de crédito (3 parcelas)
 *               value:
 *                 debtIds: ["550e8400-e29b-41d4-a716-446655440001", "550e8400-e29b-41d4-a716-446655440002"]
 *                 method: CARTAO_CREDITO
 *                 installments: 3
 *                 card:
 *                   number: "4111111111111111"
 *                   expMonth: "12"
 *                   expYear: "2028"
 *                   cvv: "123"
 *                   holderName: "MARIA SILVA"
 *                 billing:
 *                   name: "Maria Silva"
 *                   email: "maria@email.com"
 *                   phone: "11999999999"
 *                   document: "12345678901"
 *                   address: "Rua Exemplo, 100"
 *                   district: "Centro"
 *                   city: "São Paulo"
 *                   state: "SP"
 *                   postalcode: "01001000"
 *                   country: "BR"
 *     responses:
 *       201:
 *         description: Pagamento criado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     paymentId: { type: string, format: uuid }
 *                     referenceNum:
 *                       type: string
 *                       description: Referência única no formato TPW-{timestamp}-{userId[0:8]}
 *                       example: TPW-1704067200000-abcd1234
 *                     method: { $ref: '#/components/schemas/PaymentMethod' }
 *                     totalValue: { type: number, example: 250.00 }
 *                     qrCode:
 *                       type: string
 *                       nullable: true
 *                       description: String EMV para copiar-colar (PIX). null em pagamentos de cartão.
 *                       example: "00020126580014BR.GOV.BCB.PIX0136..."
 *                     checkoutUrl:
 *                       type: string
 *                       nullable: true
 *                       description: URL data:image/png;base64,... com PNG inline do QR Code (PIX). null em cartão.
 *             examples:
 *               pix_response:
 *                 summary: Resposta PIX com QR Code
 *                 value:
 *                   status: success
 *                   data:
 *                     paymentId: "550e8400-e29b-41d4-a716-446655440099"
 *                     referenceNum: "TPW-1704067200000-abcd1234"
 *                     method: PIX
 *                     totalValue: 250.00
 *                     qrCode: "00020126580014BR.GOV.BCB.PIX0136..."
 *                     checkoutUrl: "data:image/png;base64,iVBORw0KGgoAAAANS..."
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

/**
 * @swagger
 * /payments/partial:
 *   post:
 *     tags: [Payments]
 *     summary: Pagamento parcial via PIX
 *     description: |
 *       Cria um pagamento parcial de uma única dívida via PIX.
 *
 *       **Rate limit:** 5 requisições por 5 minutos por IP.
 *
 *       **Regras de validação:**
 *       - Feature deve estar habilitada (`partial_payment_enabled = "true"`)
 *       - `amount` deve ser >= `partial_payment_min_amount`
 *       - `amount` não pode exceder o valor restante da dívida
 *       - Após o pagamento, o valor restante deve ser 0 OU >= `partial_payment_min_remaining`
 *       - Múltiplos pagamentos parciais na mesma dívida são permitidos até quitar totalmente
 *
 *       **Hierarquia:** CONSULTOR só consegue pagar dívidas do seu próprio `codigo`.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreatePartialPaymentDTO'
 *           example:
 *             debtId: "550e8400-e29b-41d4-a716-446655440000"
 *             amount: 40.00
 *     responses:
 *       201:
 *         description: Pagamento parcial criado; aguarda confirmação via callback
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PartialPaymentResponse'
 *       400:
 *         description: |
 *           Dados inválidos ou regra de negócio violada. Possíveis causas:
 *           - `amount` abaixo do mínimo configurado
 *           - `amount` excede o valor restante da dívida
 *           - Valor restante após pagamento ficaria entre 0 e o mínimo configurado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Feature de pagamento parcial desabilitada pelo admin
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Dívida não encontrada ou não pertence ao usuário
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       429:
 *         description: Rate limit atingido (5 req / 5 min)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post(
  '/partial',
  paymentLinkRateLimiter,
  partialPaymentValidator,
  (req: Request, res: Response, next: NextFunction) => paymentController.createPartial(req, res, next),
);

export default router;
