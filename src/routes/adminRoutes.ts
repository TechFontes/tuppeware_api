import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import adminController from '../controllers/AdminController';
import { authMiddleware } from '../middlewares/authMiddleware';
import { roleMiddleware } from '../middlewares/roleMiddleware';
import { csvUploadValidator } from '../validators/adminValidator';

const router = Router();

// Upload em memória (buffer) para CSV
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    const allowedMimeTypes = ['text/csv', 'text/plain', 'application/vnd.ms-excel'];

    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Formato de arquivo inválido. Envie um arquivo CSV.'));
    }
  },
});

// Todas as rotas admin requerem autenticação + perfil ADMIN
router.use(authMiddleware);
router.use(roleMiddleware('ADMIN'));

/**
 * @swagger
 * /admin/import/consultants:
 *   post:
 *     tags: [Admin]
 *     summary: Importar consultores via CSV
 *     description: |
 *       Importa consultores a partir de um arquivo CSV.
 *
 *       **Formato esperado:** codigo;tipo;grupo;distrito;CPF
 *
 *       **Tipos:** 1 = Empresária, 2 = Líder, 3 = Consultor
 *
 *       Se já existir um usuário com o CPF do consultor, o vínculo e a role são atualizados automaticamente.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Arquivo CSV (máx. 5MB)
 *     responses:
 *       200:
 *         description: Importação concluída
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
 *                   $ref: '#/components/schemas/ImportResult'
 *       400:
 *         description: Arquivo inválido ou CSV vazio
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Acesso negado (requer perfil ADMIN)
 */
router.post(
  '/import/consultants',
  upload.single('file'),
  csvUploadValidator,
  (req: Request, res: Response, next: NextFunction) => adminController.importConsultants(req, res, next),
);

/**
 * @swagger
 * /admin/import/debts:
 *   post:
 *     tags: [Admin]
 *     summary: Importar débitos via CSV
 *     description: |
 *       Importa débitos a partir de um arquivo CSV.
 *
 *       **Formato esperado:** codigo;nome;grupo;distrito;semana;valor;dias_atraso;data_vencimento;numero_nf
 *
 *       O status é determinado automaticamente: ATRASADO se dias_atraso > 0, senão PENDENTE.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Arquivo CSV (máx. 5MB)
 *     responses:
 *       200:
 *         description: Importação concluída
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
 *                   $ref: '#/components/schemas/ImportResult'
 *       400:
 *         description: Arquivo inválido ou CSV vazio
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Acesso negado (requer perfil ADMIN)
 */
router.post(
  '/import/debts',
  upload.single('file'),
  csvUploadValidator,
  (req: Request, res: Response, next: NextFunction) => adminController.importDebts(req, res, next),
);

export default router;
