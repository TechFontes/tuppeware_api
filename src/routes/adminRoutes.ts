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
 *         description: Usuário não encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
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
 *             properties:
 *               name: { type: string }
 *               email: { type: string, format: email }
 *               role: { $ref: '#/components/schemas/UserRole' }
 *               isActive: { type: boolean }
 *               phone: { type: string, nullable: true }
 *               birthDate: { type: string, format: date, nullable: true, description: 'YYYY-MM-DD ou ISO 8601 completo' }
 *               address: { type: string, nullable: true }
 *               addressNumber: { type: string, nullable: true }
 *               addressComplement: { type: string, nullable: true }
 *               neighbourhood: { type: string, nullable: true }
 *               city: { type: string, nullable: true }
 *               state: { type: string, nullable: true, example: 'SP' }
 *               postalCode: { type: string, nullable: true, example: '01310-100' }
 *               newPassword: { type: string, format: password, minLength: 8 }
 *     responses:
 *       200:
 *         description: Usuário atualizado
 *       400:
 *         description: Dados inválidos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
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
 *         description: Usuário não encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
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
 *         description: Usuário não encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
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
 *         description: Usuário não encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
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
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Não autenticado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Sem admins.manage / anti-escalada / admins.manage só GERENTE
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: CPF ou e-mail já cadastrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
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
 *       401:
 *         description: Não autenticado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Acesso negado (requer admins.manage)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
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
 *       400:
 *         description: Body inválido / target não é ADMIN
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Não autenticado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Sem admins.manage / anti-escalada / admins.manage só GERENTE
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: ADM não encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
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
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Não autenticado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Acesso negado (requer admins.manage)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: ADMIN não encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
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
 *       401:
 *         description: Não autenticado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Acesso negado (requer settings.manage)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
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
 *       401:
 *         description: Não autenticado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Acesso negado (requer role GERENTE)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.put(
  '/settings',
  requirePermission(AdminPermission.SETTINGS_MANAGE),
  (req: Request, res: Response, next: NextFunction) => adminController.updateSettings(req, res, next),
);

// ============================================================
// Debts — ADMIN + GERENTE
// ============================================================

/**
 * @swagger
 * /admin/debts:
 *   post:
 *     tags: [Admin]
 *     summary: Criar débito manualmente
 *     description: Cria um débito avulso sem importação CSV. Útil para lançamentos pontuais.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [codigo, nome, valor, dataVencimento, numeroNf]
 *             properties:
 *               codigo:
 *                 type: string
 *                 example: '001234'
 *                 description: Código da consultora
 *               nome: { type: string, example: 'Maria Silva' }
 *               grupo: { type: string, example: 'G01' }
 *               distrito: { type: string, example: 'D01' }
 *               semana: { type: string, example: '2025-01' }
 *               valor:
 *                 type: number
 *                 format: decimal
 *                 example: 250.00
 *               dataVencimento:
 *                 type: string
 *                 format: date-time
 *                 example: '2025-06-30T00:00:00.000Z'
 *               numeroNf:
 *                 type: string
 *                 example: 'NF-2025-001'
 *                 description: Número da nota fiscal (chave única)
 *               status:
 *                 $ref: '#/components/schemas/DebtStatus'
 *     responses:
 *       201:
 *         description: Débito criado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data: { $ref: '#/components/schemas/Debt' }
 *       400:
 *         description: Dados inválidos ou numeroNf duplicado
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401: { description: Não autenticado }
 *       403: { description: Sem permissão debts.manage }
 */
router.post(
  '/debts',
  requirePermission(AdminPermission.DEBTS_MANAGE),
  (req: Request, res: Response, next: NextFunction) => adminController.createDebt(req, res, next),
);

/**
 * @swagger
 * /admin/debts/{id}/status:
 *   patch:
 *     tags: [Admin]
 *     summary: Atualizar status de um débito
 *     description: Altera manualmente o status de um débito. Útil para correções operacionais.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *         description: ID do débito
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 $ref: '#/components/schemas/DebtStatus'
 *     responses:
 *       200:
 *         description: Status atualizado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data: { $ref: '#/components/schemas/Debt' }
 *       400:
 *         description: Status inválido
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401: { description: Não autenticado }
 *       403: { description: Sem permissão debts.manage }
 *       404:
 *         description: Débito não encontrado
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.patch(
  '/debts/:id/status',
  requirePermission(AdminPermission.DEBTS_MANAGE),
  (req: Request, res: Response, next: NextFunction) => adminController.updateDebtStatus(req, res, next),
);

/**
 * @swagger
 * /admin/debts/weekly:
 *   get:
 *     tags: [Admin]
 *     summary: Listar débitos da semana
 *     description: Retorna todos os débitos de uma semana específica. Se semana não informada, usa a semana atual.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: semana
 *         required: false
 *         schema: { type: string, example: '2025-01' }
 *         description: Código da semana no formato YYYY-WW. Se omitido, usa semana corrente.
 *     responses:
 *       200:
 *         description: Débitos da semana
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 total: { type: integer, example: 48 }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Debt' }
 *       401: { description: Não autenticado }
 *       403: { description: Sem permissão debts.manage }
 */
router.get(
  '/debts/weekly',
  requirePermission(AdminPermission.DEBTS_MANAGE),
  (req: Request, res: Response, next: NextFunction) => adminController.getWeeklyDebts(req, res, next),
);

/**
 * @swagger
 * /admin/debts/paid-today:
 *   get:
 *     tags: [Admin]
 *     summary: Débitos pagos hoje
 *     description: Retorna todos os débitos cujo status foi alterado para PAGO no dia corrente.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Débitos pagos no dia
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 total: { type: integer, example: 12 }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Debt' }
 *       401: { description: Não autenticado }
 *       403: { description: Sem permissão debts.manage }
 */
router.get(
  '/debts/paid-today',
  requirePermission(AdminPermission.DEBTS_MANAGE),
  (req: Request, res: Response, next: NextFunction) => adminController.getPaidTodayDebts(req, res, next),
);

// ============================================================
// Clients — ADMIN + GERENTE
// ============================================================

/**
 * @swagger
 * /admin/clients:
 *   get:
 *     tags: [Admin]
 *     summary: Listar consultoras (clientes ativos)
 *     description: |
 *       Lista usuários ativos com dados de consultor vinculado (grupo, distrito, código).
 *       Filtrável por grupo e distrito. Resultado paginado.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: grupo
 *         schema: { type: string }
 *         description: Filtrar por grupo
 *       - in: query
 *         name: distrito
 *         schema: { type: string }
 *         description: Filtrar por distrito
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *         description: Número da página
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *         description: Itens por página
 *     responses:
 *       200:
 *         description: Lista paginada de consultoras ativas
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - type: object
 *                   properties:
 *                     status: { type: string, example: success }
 *                 - $ref: '#/components/schemas/PaginatedResponse'
 *       401: { description: Não autenticado }
 *       403: { description: Sem permissão users.manage }
 */
router.get(
  '/clients',
  requirePermission(AdminPermission.USERS_MANAGE),
  (req: Request, res: Response, next: NextFunction) => adminController.listClients(req, res, next),
);

/**
 * @swagger
 * /admin/clients/{id}:
 *   patch:
 *     tags: [Admin]
 *     summary: Atualizar grupo/distrito de uma consultora
 *     description: Atualiza os dados de vínculo (grupo e/ou distrito) do consultor associado ao usuário.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *         description: ID do usuário (não do consultor)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               grupo: { type: string, example: 'G02' }
 *               distrito: { type: string, example: 'D02' }
 *     responses:
 *       200:
 *         description: Dados de vínculo atualizados
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data: { $ref: '#/components/schemas/User' }
 *       401: { description: Não autenticado }
 *       403: { description: Sem permissão users.manage }
 *       404:
 *         description: Usuário ou consultor vinculado não encontrado
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.patch(
  '/clients/:id',
  requirePermission(AdminPermission.USERS_MANAGE),
  (req: Request, res: Response, next: NextFunction) => adminController.updateClient(req, res, next),
);

// ============================================================
// Organization — ADMIN + GERENTE
// ============================================================

/**
 * @swagger
 * /admin/organization:
 *   get:
 *     tags: [Admin]
 *     summary: Visão organizacional (consultoras com vínculos)
 *     description: |
 *       Retorna a estrutura organizacional de consultoras com seus dados de grupo e distrito.
 *       Útil para visualização hierárquica no painel admin.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: grupo
 *         schema: { type: string }
 *         description: Filtrar por grupo
 *       - in: query
 *         name: distrito
 *         schema: { type: string }
 *         description: Filtrar por distrito
 *     responses:
 *       200:
 *         description: Lista de consultoras com dados organizacionais
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
 *                       id: { type: string, format: uuid }
 *                       codigo: { type: string }
 *                       tipo:
 *                         type: integer
 *                         enum: [1, 2, 3]
 *                         description: '1=Empresária 2=Líder 3=Consultor'
 *                       grupo: { type: string }
 *                       distrito: { type: string }
 *                       cpf: { type: string }
 *                       userId: { type: string, format: uuid, nullable: true }
 *       401: { description: Não autenticado }
 *       403: { description: Sem permissão users.manage }
 */
router.get(
  '/organization',
  requirePermission(AdminPermission.USERS_MANAGE),
  (req: Request, res: Response, next: NextFunction) => adminController.getOrganization(req, res, next),
);

// ============================================================
// Reports — ADMIN + GERENTE
// ============================================================

/**
 * @swagger
 * /admin/reports/paid-documents:
 *   get:
 *     tags: [Admin]
 *     summary: Relatório de documentos pagos
 *     description: |
 *       Lista pagamentos concluídos (status PAGO) com os débitos vinculados, filtráveis por período.
 *       Destinado a exportação/conciliação financeira.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: dataInicio
 *         schema: { type: string, format: date, example: '2025-01-01' }
 *         description: Data inicial do período (ISO 8601 date)
 *       - in: query
 *         name: dataFim
 *         schema: { type: string, format: date, example: '2025-01-31' }
 *         description: Data final do período (ISO 8601 date)
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Documentos pagos no período
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - type: object
 *                   properties:
 *                     status: { type: string, example: success }
 *                 - $ref: '#/components/schemas/PaginatedResponse'
 *       401: { description: Não autenticado }
 *       403: { description: Sem permissão reports.view }
 */
router.get(
  '/reports/paid-documents',
  requirePermission(AdminPermission.REPORTS_VIEW),
  (req: Request, res: Response, next: NextFunction) => adminController.getPaidDocuments(req, res, next),
);

export default router;
