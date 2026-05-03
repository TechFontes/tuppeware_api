import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import adminController from '../controllers/AdminController';
import { authMiddleware } from '../middlewares/authMiddleware';
import { roleMiddleware } from '../middlewares/roleMiddleware';
import { requirePermission } from '../middlewares/permissionMiddleware';
import { csvUploadValidator } from '../validators/adminValidator';
import { AdminPermission } from '../types/permissions';

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
  requirePermission(AdminPermission.USERS_MANAGE),
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
  requirePermission(AdminPermission.DEBTS_MANAGE),
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
  requirePermission(AdminPermission.USERS_MANAGE),
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
 *           $ref: '#/components/schemas/UserRole'
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
  requirePermission(AdminPermission.USERS_MANAGE),
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
  requirePermission(AdminPermission.USERS_MANAGE),
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
  requirePermission(AdminPermission.USERS_MANAGE),
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
  requirePermission(AdminPermission.USERS_MANAGE),
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
  requirePermission(AdminPermission.PAYMENTS_MANAGE),
  (req: Request, res: Response, next: NextFunction) => adminController.getUserPayments(req, res, next),
);

// ============================================================
// Permissions Catalog — ADMIN + GERENTE
// ============================================================

/**
 * @swagger
 * /admin/permissions/catalog:
 *   get:
 *     tags: [Admin]
 *     summary: Catálogo de permissões granulares ADM
 *     description: |
 *       Retorna o conjunto fechado das 8 permissões granulares disponíveis para
 *       usuários ADMIN. Frontend usa pra renderizar checkboxes do form de
 *       criação/edição de ADMs sem hardcodar as chaves.
 *
 *       Não exige permissão granular específica — apenas role ADMIN ou GERENTE.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Catálogo com 8 entries
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       key: { type: string, example: users.manage }
 *                       labelPt: { type: string, example: Gerenciar Usuários }
 *                       description: { type: string }
 *       401: { description: Não autenticado }
 *       403: { description: Role insuficiente }
 */
router.get(
  '/permissions/catalog',
  roleMiddleware('ADMIN', 'GERENTE'),
  (req: Request, res: Response, next: NextFunction) => adminController.getPermissionsCatalog(req, res, next),
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
 *     description: |
 *       Cria um novo usuário com role ADMIN. Aceita opcionalmente `jobTitle`
 *       (cargo informativo) e `permissions` (array de permissões granulares).
 *
 *       Regras de permissão (anti-escalada):
 *       - Caller não pode conceder permissão que ele mesmo não possui
 *       - `admins.manage` só pode ser concedida por GERENTE
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
 *                 format: email
 *               password:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *               jobTitle:
 *                 type: string
 *                 example: "Coordenadora"
 *                 description: Cargo livre (informativo, não afeta permissões)
 *               permissions:
 *                 type: array
 *                 description: Permissões granulares iniciais (opcional; padrão vazio)
 *                 items:
 *                   $ref: '#/components/schemas/AdminPermission'
 *     responses:
 *       201:
 *         description: ADMIN criado
 *       400:
 *         description: Dados inválidos
 *       403:
 *         description: Sem admins.manage / anti-escalada / admins.manage só GERENTE
 *       409:
 *         description: CPF ou e-mail já cadastrado
 */
router.post(
  '/managers',
  requirePermission(AdminPermission.ADMINS_MANAGE),
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
  requirePermission(AdminPermission.ADMINS_MANAGE),
  (req: Request, res: Response, next: NextFunction) => adminController.listManagers(req, res, next),
);

/**
 * @swagger
 * /admin/managers/{id}/permissions:
 *   put:
 *     tags: [Admin]
 *     summary: Atualiza permissões granulares de um ADM
 *     description: |
 *       Substitui o array completo de permissões do ADM `id`. Aceita array
 *       vazio para revogar todas. Cache do `permissionMiddleware` é invalidado
 *       imediatamente — próxima request do target lê fresh do DB.
 *
 *       Regras (no UserService):
 *       - Anti-escalada: caller não-GERENTE não pode dar permissão que ele
 *         mesmo não tem (403)
 *       - `admins.manage` só GERENTE concede (403)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [permissions]
 *             properties:
 *               permissions:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/AdminPermission'
 *     responses:
 *       200: { description: ADM atualizado }
 *       400: { description: Body inválido / target não é ADMIN }
 *       403: { description: Sem admins.manage / anti-escalada / admins.manage só GERENTE }
 *       404: { description: ADM não encontrado }
 */
router.put(
  '/managers/:id/permissions',
  requirePermission(AdminPermission.ADMINS_MANAGE),
  (req: Request, res: Response, next: NextFunction) => adminController.updateManagerPermissions(req, res, next),
);

/**
 * @swagger
 * /admin/managers/{id}:
 *   put:
 *     tags: [Admin]
 *     summary: Editar ADMIN (GERENTE only)
 *     description: |
 *       Atualiza dados pessoais de um usuário ADMIN: nome, e-mail e cargo.
 *       Para editar permissões granulares, use `PUT /admin/managers/:id/permissions`.
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
 *                 format: email
 *               jobTitle:
 *                 type: string
 *                 nullable: true
 *                 description: Cargo livre (informativo, não afeta permissões)
 *     responses:
 *       200:
 *         description: ADMIN atualizado
 *       400:
 *         description: Dados inválidos
 *       403:
 *         description: Acesso negado (requer admins.manage)
 *       404:
 *         description: ADMIN não encontrado
 */
router.put(
  '/managers/:id',
  requirePermission(AdminPermission.ADMINS_MANAGE),
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
  requirePermission(AdminPermission.SETTINGS_MANAGE),
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
  requirePermission(AdminPermission.SETTINGS_MANAGE),
  (req: Request, res: Response, next: NextFunction) => adminController.updateSettings(req, res, next),
);

// ============================================================
// Debts — ADMIN + GERENTE
// ============================================================

router.post(
  '/debts',
  requirePermission(AdminPermission.DEBTS_MANAGE),
  (req: Request, res: Response, next: NextFunction) => adminController.createDebt(req, res, next),
);

router.patch(
  '/debts/:id/status',
  requirePermission(AdminPermission.DEBTS_MANAGE),
  (req: Request, res: Response, next: NextFunction) => adminController.updateDebtStatus(req, res, next),
);

router.get(
  '/debts/weekly',
  requirePermission(AdminPermission.DEBTS_MANAGE),
  (req: Request, res: Response, next: NextFunction) => adminController.getWeeklyDebts(req, res, next),
);

router.get(
  '/debts/paid-today',
  requirePermission(AdminPermission.DEBTS_MANAGE),
  (req: Request, res: Response, next: NextFunction) => adminController.getPaidTodayDebts(req, res, next),
);

// ============================================================
// Clients — ADMIN + GERENTE
// ============================================================

router.get(
  '/clients',
  requirePermission(AdminPermission.USERS_MANAGE),
  (req: Request, res: Response, next: NextFunction) => adminController.listClients(req, res, next),
);

router.patch(
  '/clients/:id',
  requirePermission(AdminPermission.USERS_MANAGE),
  (req: Request, res: Response, next: NextFunction) => adminController.updateClient(req, res, next),
);

// ============================================================
// Organization — ADMIN + GERENTE
// ============================================================

router.get(
  '/organization',
  requirePermission(AdminPermission.USERS_MANAGE),
  (req: Request, res: Response, next: NextFunction) => adminController.getOrganization(req, res, next),
);

// ============================================================
// Reports — ADMIN + GERENTE
// ============================================================

router.get(
  '/reports/paid-documents',
  requirePermission(AdminPermission.REPORTS_VIEW),
  (req: Request, res: Response, next: NextFunction) => adminController.getPaidDocuments(req, res, next),
);

export default router;
