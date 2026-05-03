import { Router, Request, Response, NextFunction } from 'express';
import eredeWebhookController from '../controllers/EredeWebhookController';

const router = Router();

/**
 * @swagger
 * /erede/webhook:
 *   post:
 *     tags: [eRede]
 *     summary: Webhook da eRede (sem autenticação JWT)
 *     security: []
 *     description: |
 *       Endpoint chamado pelo gateway eRede para notificar eventos de
 *       tokenização (PV.TOKENIZACAO-*) e transação (PV.TRANSACAO-*).
 *       Idempotência via header Request-ID. Secret opcional via X-Erede-Secret.
 *     parameters:
 *       - in: header
 *         name: Request-ID
 *         required: true
 *         schema: { type: string }
 *       - in: header
 *         name: X-Erede-Secret
 *         required: false
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               eventType: { type: string, example: 'PV.TOKENIZACAO-BANDEIRA' }
 *               tokenizationId: { type: string }
 *               tid: { type: string }
 *     responses:
 *       200: { description: Evento processado (ou duplicata) }
 *       400: { description: Header ou body inválido }
 *       401: { description: Secret inválido }
 *       500: { description: Falha no processamento — Rede deve reentregar }
 */
router.post('/webhook', (req: Request, res: Response, next: NextFunction) =>
  eredeWebhookController.handle(req, res, next),
);

export default router;
