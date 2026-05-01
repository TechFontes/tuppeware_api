import { Router, Request, Response, NextFunction } from 'express';
import debtController from '../controllers/DebtController';
import { authMiddleware } from '../middlewares/authMiddleware';

const router = Router();

// Todas as rotas de débitos requerem autenticação
router.use(authMiddleware);

/**
 * @swagger
 * /debts:
 *   get:
 *     tags: [Debts]
 *     summary: Listar débitos
 *     description: Lista débitos com filtros, ordenação e paginação. Respeita a hierarquia de acesso (ADMIN vê todos, EMPRESARIA vê do distrito, LIDER vê do grupo, CONSULTOR vê os próprios).
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
 *         name: search
 *         schema:
 *           type: string
 *         description: Busca por nome ou número da NF
 *       - in: query
 *         name: grupo
 *         schema:
 *           type: string
 *         description: Filtrar por grupo
 *       - in: query
 *         name: distrito
 *         schema:
 *           type: string
 *         description: Filtrar por distrito
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDENTE, ATRASADO, PAGO]
 *         description: Filtrar por status
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [nome, valor, dataVencimento, status, diasAtraso]
 *           default: dataVencimento
 *         description: Campo para ordenação
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Direção da ordenação
 *     responses:
 *       200:
 *         description: Lista de débitos paginada
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
router.get('/', (req: Request, res: Response, next: NextFunction) => debtController.index(req, res, next));

/**
 * @swagger
 * /debts/summary:
 *   get:
 *     tags: [Debts]
 *     summary: Resumo agregado de débitos para o dashboard
 *     description: |
 *       Retorna métricas agregadas (totais, soma a receber, consultores em atraso,
 *       grupos com pendências) respeitando a hierarquia do usuário:
 *       - ADMIN/GERENTE: todos os débitos. Aceitam ?grupo=X&distrito=Y para refinar.
 *       - EMPRESARIA: débitos do distrito do consultor vinculado.
 *       - LIDER: débitos do grupo do consultor vinculado.
 *       - CONSULTOR: débitos do código do consultor vinculado.
 *
 *       Definições:
 *       - **totalDebitos**: count de débitos com status PENDENTE ou ATRASADO.
 *       - **valorTotal**: soma de (valor - paidAmount) dos débitos a receber.
 *       - **consultoresAtraso**: count distinct de códigos de consultor com pelo menos 1 débito ATRASADO.
 *       - **gruposAtivos**: count distinct de grupos com pelo menos 1 débito a receber.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: grupo
 *         required: false
 *         schema: { type: string }
 *         description: Filtrar por grupo (apenas ADMIN/GERENTE)
 *       - in: query
 *         name: distrito
 *         required: false
 *         schema: { type: string }
 *         description: Filtrar por distrito (apenas ADMIN/GERENTE)
 *     responses:
 *       200:
 *         description: Métricas agregadas
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalDebitos: { type: integer, example: 142 }
 *                     valorTotal: { type: number, example: 12345.67 }
 *                     consultoresAtraso: { type: integer, example: 18 }
 *                     gruposAtivos: { type: integer, example: 7 }
 *       401: { description: Não autenticado }
 *       403: { description: Consultor não vinculado (roles hierárquicas) }
 */
router.get('/summary', (req: Request, res: Response, next: NextFunction) => debtController.getSummary(req, res, next));

/**
 * @swagger
 * /debts/{id}:
 *   get:
 *     tags: [Debts]
 *     summary: Buscar débito por ID
 *     description: Retorna os detalhes de um débito específico, incluindo pagamentos vinculados.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID do débito
 *     responses:
 *       200:
 *         description: Detalhes do débito
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   $ref: '#/components/schemas/Debt'
 *       404:
 *         description: Débito não encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/:id', (req: Request, res: Response, next: NextFunction) => debtController.show(req, res, next));

export default router;
