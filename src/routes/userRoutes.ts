import { Router, Request, Response, NextFunction } from 'express';
import userController from '../controllers/UserController';
import { authMiddleware } from '../middlewares/authMiddleware';
import { updateMeValidator } from '../validators/userValidator';
import { createSavedCardValidator } from '../validators/savedCardValidator';
import { validate } from '../validators/validationMiddleware';

const router = Router();

router.use(authMiddleware);

/**
 * @swagger
 * /users/me:
 *   get:
 *     tags: [Users]
 *     summary: Obter perfil próprio
 *     description: |
 *       Retorna os dados do usuário autenticado, dados de consultor se vinculado e
 *       o bloco `settings` com flags globais públicas do sistema (consumido pelo frontend
 *       para decidir, por exemplo, se o fluxo de pagamento parcial deve ser exibido).
 *
 *       Chaves expostas em `settings`:
 *       - `partialPaymentEnabled` (boolean) — feature flag de pagamento parcial
 *       - `partialPaymentMinAmount` (string | null) — valor mínimo por parcial
 *       - `partialPaymentMinRemaining` (string | null) — valor mínimo restante após parcial
 *
 *       Para usuários com role ADMIN, os campos `jobTitle` e `permissions` são
 *       retornados no objeto `data`. Para demais roles, `permissions` é array vazio
 *       e `jobTitle` é null.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Perfil do usuário
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     email:
 *                       type: string
 *                     role:
 *                       type: string
 *                     jobTitle:
 *                       type: string
 *                       nullable: true
 *                       example: "Coordenadora de Cobrança"
 *                     permissions:
 *                       type: array
 *                       description: Permissões granulares ADM (vazio para roles não-admin)
 *                       items:
 *                         $ref: '#/components/schemas/AdminPermission'
 *                       example: ["users.manage", "debts.manage"]
 *                     settings:
 *                       type: object
 *                       properties:
 *                         partialPaymentEnabled:
 *                           type: boolean
 *                           example: true
 *                         partialPaymentMinAmount:
 *                           type: string
 *                           nullable: true
 *                           example: "10.00"
 *                         partialPaymentMinRemaining:
 *                           type: string
 *                           nullable: true
 *                           example: "20.00"
 *       401:
 *         description: Não autenticado
 */
router.get(
  '/me',
  (req: Request, res: Response, next: NextFunction) => userController.getMe(req, res, next),
);

/**
 * @swagger
 * /users/me:
 *   put:
 *     tags: [Users]
 *     summary: Atualizar perfil próprio
 *     description: |
 *       Edita os dados do perfil do usuário autenticado.
 *       **Campos permitidos:** name, phone, birthDate, address, addressNumber,
 *       addressComplement, neighbourhood, city, state, postalCode.
 *       **Proibido alterar:** email, CPF.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               phone:
 *                 type: string
 *               birthDate:
 *                 type: string
 *                 format: date
 *               address:
 *                 type: string
 *               addressNumber:
 *                 type: string
 *               addressComplement:
 *                 type: string
 *               neighbourhood:
 *                 type: string
 *               city:
 *                 type: string
 *               state:
 *                 type: string
 *                 example: SP
 *               postalCode:
 *                 type: string
 *                 example: 01310-100
 *                 description: "CEP do perfil do usuário — camelCase, com ou sem hífen"
 *     responses:
 *       200:
 *         description: Perfil atualizado
 *       400:
 *         description: Dados inválidos
 *       401:
 *         description: Não autenticado
 */
router.put(
  '/me',
  updateMeValidator,
  validate,
  (req: Request, res: Response, next: NextFunction) => userController.updateMe(req, res, next),
);

/**
 * @swagger
 * /users/me/saved-cards:
 *   post:
 *     tags: [Users]
 *     summary: Salvar cartão (tokenizar via eRede)
 *     description: |
 *       Tokeniza um cartão de crédito via eRede e salva o token para uso futuro.
 *       O token opaco não é retornado ao frontend.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [cardNumber, expMonth, expYear, holderName]
 *             properties:
 *               cardNumber:
 *                 type: string
 *                 example: '4111111111111111'
 *                 description: Número do cartão (13-19 dígitos)
 *               expMonth:
 *                 type: string
 *                 example: '12'
 *                 description: Mês de expiração (01-12)
 *               expYear:
 *                 type: string
 *                 example: '2028'
 *                 description: Ano de expiração (4 dígitos)
 *               holderName:
 *                 type: string
 *                 example: 'JOAO DA SILVA'
 *                 description: Nome do titular
 *               securityCode:
 *                 type: string
 *                 example: '123'
 *                 description: CVV opcional — se enviado, valida no momento da tokenização
 *     responses:
 *       201:
 *         description: |
 *           Cartão tokenizado e salvo (Cofre eRede). O `tokenizationId` opaco
 *           NUNCA é retornado ao frontend. Status pode ser PENDING (sync via
 *           webhook) ou ACTIVE (sync imediato funcionou).
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: 'success' }
 *                 data:
 *                   $ref: '#/components/schemas/SavedCardResponse'
 *       400:
 *         description: Dados inválidos
 *       401:
 *         description: Não autenticado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       422:
 *         description: Tokenização recusada pela eRede (cartão inválido)
 *       502:
 *         description: Falha na comunicação com a eRede
 */
router.post(
  '/me/saved-cards',
  createSavedCardValidator,
  validate,
  (req: Request, res: Response, next: NextFunction) => userController.createSavedCard(req, res, next),
);

/**
 * @swagger
 * /users/me/saved-cards:
 *   get:
 *     tags: [Users]
 *     summary: Listar cartões salvos
 *     description: "Retorna os cartões tokenizados (Cofre eRede) do usuário. Inclui status atual de cada token (PENDING/ACTIVE/INACTIVE/FAILED)."
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de cartões tokenizados
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/SavedCardResponse'
 *       401:
 *         description: Não autenticado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get(
  '/me/saved-cards',
  (req: Request, res: Response, next: NextFunction) => userController.getSavedCards(req, res, next),
);

/**
 * @swagger
 * /users/me/saved-cards/{id}:
 *   delete:
 *     tags: [Users]
 *     summary: Remover cartão salvo
 *     description: "Remove o token do Cofre eRede e apaga o registro local. Operação irreversível."
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       204:
 *         description: Cartão removido
 *       401:
 *         description: Não autenticado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Acesso negado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Cartão não encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.delete(
  '/me/saved-cards/:id',
  (req: Request, res: Response, next: NextFunction) => userController.deleteSavedCard(req, res, next),
);

export default router;
