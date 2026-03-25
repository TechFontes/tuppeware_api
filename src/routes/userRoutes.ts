import { Router, Request, Response, NextFunction } from 'express';
import userController from '../controllers/UserController';
import { authMiddleware } from '../middlewares/authMiddleware';
import { updateMeValidator } from '../validators/userValidator';
import { validate } from '../validators/validationMiddleware';

const router = Router();

router.use(authMiddleware);

/**
 * @swagger
 * /users/me:
 *   get:
 *     tags: [Users]
 *     summary: Obter perfil próprio
 *     description: Retorna os dados do usuário autenticado, incluindo dados de consultor se vinculado.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Perfil do usuário
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
 *   get:
 *     tags: [Users]
 *     summary: Listar cartões salvos
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de cartões tokenizados
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
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: Cartão removido
 *       403:
 *         description: Acesso negado
 *       404:
 *         description: Cartão não encontrado
 */
router.delete(
  '/me/saved-cards/:id',
  (req: Request, res: Response, next: NextFunction) => userController.deleteSavedCard(req, res, next),
);

export default router;
