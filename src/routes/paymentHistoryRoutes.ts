import { Router, Request, Response, NextFunction } from 'express';
import paymentHistoryController from '../controllers/PaymentHistoryController';
import { authMiddleware } from '../middlewares/authMiddleware';

const router = Router();

// Todas as rotas de histórico requerem autenticação
router.use(authMiddleware);

/**
 * @swagger
 * /payment-history:
 *   get:
 *     tags: [PaymentHistory]
 *     summary: Listar histórico de pagamentos
 *     description: Lista o histórico de pagamentos do usuário autenticado com paginação e filtros.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Número da página
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           maximum: 100
 *         description: Itens por página
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDENTE, PAGO, CANCELADO]
 *         description: Filtrar por status do pagamento
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Busca por número da NF nos débitos vinculados
 *     responses:
 *       200:
 *         description: Histórico de pagamentos paginado
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                       example: success
 *                 - $ref: '#/components/schemas/PaginatedResponse'
 *       401:
 *         description: Não autenticado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/', (req: Request, res: Response, next: NextFunction) => paymentHistoryController.index(req, res, next));

/**
 * @swagger
 * /payment-history/{id}:
 *   get:
 *     tags: [PaymentHistory]
 *     summary: Buscar pagamento por ID
 *     description: Retorna os detalhes de um pagamento específico do usuário autenticado, incluindo débitos vinculados.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID do pagamento
 *     responses:
 *       200:
 *         description: Detalhes do pagamento
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   $ref: '#/components/schemas/Payment'
 *       403:
 *         description: Acesso negado a este pagamento
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Pagamento não encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/:id', (req: Request, res: Response, next: NextFunction) => paymentHistoryController.show(req, res, next));

export default router;
