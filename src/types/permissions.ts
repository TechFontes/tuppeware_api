/**
 * Catálogo fechado de permissões granulares para usuários ADMIN.
 *
 * Persistido como `users.permissions` (coluna JSON, array de strings).
 * Cada chave segue o padrão `dominio.acao` em snake_case com ponto.
 *
 * Para validar acesso: ver `src/middlewares/permissionMiddleware.ts`.
 * Para concessão: ver `UserService.createAdmin` e `UserService.updateAdminPermissions`
 * (regras de anti-escalada e `admins.manage` apenas-GERENTE estão lá).
 */
export const AdminPermission = {
  USERS_MANAGE: 'users.manage',
  DEBTS_MANAGE: 'debts.manage',
  PAYMENTS_MANAGE: 'payments.manage',
  REPORTS_VIEW: 'reports.view',
  REPORTS_EXPORT: 'reports.export',
  SETTINGS_MANAGE: 'settings.manage',
  ADMINS_MANAGE: 'admins.manage',
  TRANSACTIONS_APPROVE: 'transactions.approve',
} as const;

export type AdminPermission = typeof AdminPermission[keyof typeof AdminPermission];

export const ALL_PERMISSIONS: AdminPermission[] = Object.values(AdminPermission);

export interface PermissionCatalogEntry {
  key: AdminPermission;
  labelPt: string;
  description: string;
}

export const PERMISSION_CATALOG: PermissionCatalogEntry[] = [
  {
    key: AdminPermission.USERS_MANAGE,
    labelPt: 'Gerenciar Usuários',
    description: 'Criar, editar e excluir usuários consultores/líderes',
  },
  {
    key: AdminPermission.DEBTS_MANAGE,
    labelPt: 'Gerenciar Débitos',
    description: 'Importar, editar e excluir débitos',
  },
  {
    key: AdminPermission.PAYMENTS_MANAGE,
    labelPt: 'Gerenciar Pagamentos',
    description: 'Visualizar e processar pagamentos',
  },
  {
    key: AdminPermission.REPORTS_VIEW,
    labelPt: 'Visualizar Relatórios',
    description: 'Acessar e visualizar relatórios do sistema',
  },
  {
    key: AdminPermission.REPORTS_EXPORT,
    labelPt: 'Exportar Relatórios',
    description: 'Exportar dados e relatórios em CSV/Excel',
  },
  {
    key: AdminPermission.SETTINGS_MANAGE,
    labelPt: 'Configurar Sistema',
    description: 'Alterar configurações gerais do sistema',
  },
  {
    key: AdminPermission.ADMINS_MANAGE,
    labelPt: 'Gerenciar Hierarquia ADM',
    description: 'Criar e editar usuários ADM (apenas GERENTE)',
  },
  {
    key: AdminPermission.TRANSACTIONS_APPROVE,
    labelPt: 'Aprovar Transações',
    description: 'Aprovar transações de alto valor',
  },
];

export function isValidPermission(key: string): key is AdminPermission {
  return (ALL_PERMISSIONS as string[]).includes(key);
}

export function hasPermission(perms: string[], perm: AdminPermission): boolean {
  return perms.includes(perm);
}
