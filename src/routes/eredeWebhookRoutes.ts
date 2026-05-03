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
 *         description: Secret configurado via EREDE_CALLBACK_SECRET. Se configurado no sistema, header é obrigatório e validado em tempo constante (timingSafeStringCompare).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [eventType]
 *             properties:
 *               eventType:
 *                 type: string
 *                 description: Tipo do evento. Prefixo PV.TOKENIZACAO-* mapeia para EredeWebhookEventType.TOKENIZATION; PV.TRANSACAO-* mapeia para TRANSACTION.
 *                 example: 'PV.TOKENIZACAO-BANDEIRA'
 *               tokenizationId:
 *                 type: string
 *                 description: Presente em eventos de tokenização
 *                 example: '7f3e2a1b-0c4d-5e6f-7a8b-9c0d1e2f3a4b'
 *               tid:
 *                 type: string
 *                 description: Presente em eventos de transação
 *                 example: 'tid_001122334455'
 *           examples:
 *             tokenizacao:
 *               summary: Evento de tokenização bem-sucedida
 *               value:
 *                 eventType: "PV.TOKENIZACAO-BANDEIRA"
 *                 tokenizationId: "abc123def456"
 *             transacao:
 *               summary: Evento de confirmação de transação
 *               value:
 *                 eventType: "PV.TRANSACAO-APROVADA"
 *                 tid: "tid_001122334455"
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
