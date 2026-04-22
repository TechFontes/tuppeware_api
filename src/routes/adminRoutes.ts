import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import adminController from '../controllers/AdminController';
import { authMiddleware } from '../middlewares/authMiddleware';
import { roleMiddleware } from '../middlewares/roleMiddleware';
import { csvUploadValidator } from '../validators/adminValidator';

const router = Router();

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

router.use(authMiddleware);

// ============================================================
// CSV Imports — ADMIN + GERENTE
// ============================================================

/**
 * @swagger
 * /admin/import/consultants:
 *   post:
 *     tags: [Admin]
 *     summary: Importar consultores via CSV
 *     description: |
 *       **Formato:** codigo;tipo;grupo;distrito;CPF
 *       Tipos: 1=Empresária, 2=Líder, 3=Consultor
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Importação concluída
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ImportResult'
 *       400:
 *         description: Arquivo inválido
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Acesso negado
 */
router.post(
  '/import/consultants',
  roleMiddleware('ADMIN', 'GERENTE'),
  upload.single('file'),
  csvUploadValidator,
  (req: Request, res: Response, next: NextFunction) => adminController.importConsultants(req, res, next),
);

/**
 * @swagger
 * /admin/import/debts:
 *   post:
 *     tags: [Admin]
 *     summary: Importar débitos via CSV (formato v2)
 *     description: |
 *       **Formato:** codigo;nome;grupo;distrito;semana;valor;dataVencimento;numeroNf;status
 *       Upsert por numeroNf. diasAtraso calculado automaticamente.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Importação concluída
 *       400:
 *         description: Arquivo inválido
 */
router.post(
  '/import/debts',
  roleMiddleware('ADMIN', 'GERENTE'),
  upload.single('file'),
  csvUploadValidator,
  (req: Request, res: Response, next: NextFunction) => adminController.importDebts(req, res, next),
);

/**
 * @swagger
 * /admin/import/clients:
 *   post:
 *     tags: [Admin]
 *     summary: Importar clientes via CSV (formato v2)
 *     description: |
 *       **Formato:** codigo;name;cpf;email;role;grupo;distrito
 *       Se CPF já existe: atualiza grupo/distrito. Se não existe: cria User+Consultant.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Importação concluída
 *       400:
 *         description: Arquivo inválido
 */
router.post(
  '/import/clients',
  roleMiddleware('ADMIN', 'GERENTE'),
  upload.single('file'),
  csvUploadValidator,
  (req: Request, res: Response, next: NextFunction) => adminController.importClients(req, res, next),
);

// ============================================================
// User Management — ADMIN + GERENTE
// ============================================================

/**
 * @swagger
 * /admin/users:
 *   get:
 *     tags: [Admin]
 *     summary: Listar todos os usuários
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum: [ADMIN, GERENTE, EMPRESARIA, LIDER, CONSULTOR]
 *       - in: query
 *         name: grupo
 *         schema:
 *           type: string
 *       - in: query
 *         name: distrito
 *         schema:
 *           type: string
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Lista paginada de usuários
 */
router.get(
  '/users',
  roleMiddleware('ADMIN', 'GERENTE'),
  (req: Request, res: Response, next: NextFunction) => adminController.listUsers(req, res, next),
);

/**
 * @swagger
 * /admin/users/{id}:
 *   get:
 *     tags: [Admin]
 *     summary: Obter detalhes de um usuário
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Dados do usuário
 *       404:
 *         description: Usuário não encontrado
 */
router.get(
  '/users/:id',
  roleMiddleware('ADMIN', 'GERENTE'),
  (req: Request, res: Response, next: NextFunction) => adminController.getUser(req, res, next),
);

/**
 * @swagger
 * /admin/users/{id}:
 *   put:
 *     tags: [Admin]
 *     summary: Atualizar dados de um usuário
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Usuário atualizado
 */
router.put(
  '/users/:id',
  roleMiddleware('ADMIN', 'GERENTE'),
  (req: Request, res: Response, next: NextFunction) => adminController.updateUser(req, res, next),
);

/**
 * @swagger
 * /admin/users/{id}/deactivate:
 *   patch:
 *     tags: [Admin]
 *     summary: Desativar usuário (soft delete)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Usuário desativado
 */
router.patch(
  '/users/:id/deactivate',
  roleMiddleware('ADMIN', 'GERENTE'),
  (req: Request, res: Response, next: NextFunction) => adminController.deactivateUser(req, res, next),
);

/**
 * @swagger
 * /admin/users/{id}/payments:
 *   get:
 *     tags: [Admin]
 *     summary: Histórico de pagamentos de um usuário
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Histórico de pagamentos
 */
router.get(
  '/users/:id/payments',
  roleMiddleware('ADMIN', 'GERENTE'),
  (req: Request, res: Response, next: NextFunction) => adminController.getUserPayments(req, res, next),
);

// ============================================================
// Manager Management — GERENTE only
// ============================================================

/**
 * @swagger
 * /admin/managers:
 *   post:
 *     tags: [Admin]
 *     summary: Criar usuário ADMIN (GERENTE only)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, cpf, email, password]
 *             properties:
 *               name:
 *                 type: string
 *               cpf:
 *                 type: string
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       201:
 *         description: ADMIN criado
 */
router.post(
  '/managers',
  roleMiddleware('GERENTE'),
  (req: Request, res: Response, next: NextFunction) => adminController.createManager(req, res, next),
);

/**
 * @swagger
 * /admin/managers:
 *   get:
 *     tags: [Admin]
 *     summary: Listar ADMINs (GERENTE only)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de ADMINs
 */
router.get(
  '/managers',
  roleMiddleware('GERENTE'),
  (req: Request, res: Response, next: NextFunction) => adminController.listManagers(req, res, next),
);

/**
 * @swagger
 * /admin/managers/{id}:
 *   put:
 *     tags: [Admin]
 *     summary: Editar ADMIN (GERENTE only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *     responses:
 *       200:
 *         description: ADMIN atualizado
 */
router.put(
  '/managers/:id',
  roleMiddleware('GERENTE'),
  (req: Request, res: Response, next: NextFunction) => adminController.updateManager(req, res, next),
);

// ============================================================
// Settings — GERENTE only
// ============================================================

/**
 * @swagger
 * /admin/settings:
 *   get:
 *     tags: [Admin]
 *     summary: Listar configurações (GERENTE only)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Configurações do sistema
 */
router.get(
  '/settings',
  roleMiddleware('GERENTE'),
  (req: Request, res: Response, next: NextFunction) => adminController.getSettings(req, res, next),
);

/**
 * @swagger
 * /admin/settings:
 *   put:
 *     tags: [Admin]
 *     summary: Atualizar configurações (GERENTE only)
 *     description: |
 *       Atualiza uma ou mais configurações do sistema. Todas as chaves são armazenadas como strings.
 *
 *       **Chaves aceitas:**
 *       - `max_active_payment_links` — número máximo de links de pagamento ativos por usuário (inteiro > 0)
 *       - `partial_payment_enabled` — habilita pagamentos parciais via PIX (`"true"` | `"false"`)
 *       - `partial_payment_min_amount` — valor mínimo por pagamento parcial (decimal > 0, ex: `"10.00"`)
 *       - `partial_payment_min_remaining` — valor mínimo que pode restar após um parcial (decimal >= 0, ex: `"20.00"`)
 *       - `payment_webhook_url` — URL HTTPS para receber webhooks de pagamento confirmado (ou string vazia para desabilitar)
 *       - `payment_webhook_secret` — secret HMAC-SHA256 para assinar webhooks (string >= 16 caracteres)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties:
 *               type: string
 *           examples:
 *             pagamento_parcial:
 *               summary: Habilitar pagamento parcial
 *               value:
 *                 partial_payment_enabled: "true"
 *                 partial_payment_min_amount: "10.00"
 *                 partial_payment_min_remaining: "20.00"
 *             webhook:
 *               summary: Configurar webhook
 *               value:
 *                 payment_webhook_url: "https://meu-sistema.com/webhooks/pagamento"
 *                 payment_webhook_secret: "minha-chave-secreta-32chars"
 *             basico:
 *               summary: Limite de links ativos
 *               value:
 *                 max_active_payment_links: "5"
 *     responses:
 *       200:
 *         description: Configurações atualizadas
 *       400:
 *         description: Chave desconhecida ou valor inválido
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Acesso negado (requer role GERENTE)
 */
router.put(
  '/settings',
  roleMiddleware('GERENTE'),
  (req: Request, res: Response, next: NextFunction) => adminController.updateSettings(req, res, next),
);

// ============================================================
// Debts — ADMIN + GERENTE
// ============================================================

router.post(
  '/debts',
  roleMiddleware('ADMIN', 'GERENTE'),
  (req: Request, res: Response, next: NextFunction) => adminController.createDebt(req, res, next),
);

router.patch(
  '/debts/:id/status',
  roleMiddleware('ADMIN', 'GERENTE'),
  (req: Request, res: Response, next: NextFunction) => adminController.updateDebtStatus(req, res, next),
);

router.get(
  '/debts/weekly',
  roleMiddleware('ADMIN', 'GERENTE'),
  (req: Request, res: Response, next: NextFunction) => adminController.getWeeklyDebts(req, res, next),
);

router.get(
  '/debts/paid-today',
  roleMiddleware('ADMIN', 'GERENTE'),
  (req: Request, res: Response, next: NextFunction) => adminController.getPaidTodayDebts(req, res, next),
);

// ============================================================
// Clients — ADMIN + GERENTE
// ============================================================

router.get(
  '/clients',
  roleMiddleware('ADMIN', 'GERENTE'),
  (req: Request, res: Response, next: NextFunction) => adminController.listClients(req, res, next),
);

router.patch(
  '/clients/:id',
  roleMiddleware('ADMIN', 'GERENTE'),
  (req: Request, res: Response, next: NextFunction) => adminController.updateClient(req, res, next),
);

// ============================================================
// Organization — ADMIN + GERENTE
// ============================================================

router.get(
  '/organization',
  roleMiddleware('ADMIN', 'GERENTE'),
  (req: Request, res: Response, next: NextFunction) => adminController.getOrganization(req, res, next),
);

// ============================================================
// Reports — ADMIN + GERENTE
// ============================================================

router.get(
  '/reports/paid-documents',
  roleMiddleware('ADMIN', 'GERENTE'),
  (req: Request, res: Response, next: NextFunction) => adminController.getPaidDocuments(req, res, next),
);

export default router;
