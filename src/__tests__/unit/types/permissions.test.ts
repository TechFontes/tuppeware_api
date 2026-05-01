import { describe, it, expect } from 'vitest';
import {
  AdminPermission,
  ALL_PERMISSIONS,
  PERMISSION_CATALOG,
  isValidPermission,
  hasPermission,
} from '../../../types/permissions';

describe('AdminPermission constants', () => {
  it('expõe as 8 chaves do catálogo', () => {
    expect(ALL_PERMISSIONS).toHaveLength(8);
    expect(ALL_PERMISSIONS).toContain('users.manage');
    expect(ALL_PERMISSIONS).toContain('debts.manage');
    expect(ALL_PERMISSIONS).toContain('payments.manage');
    expect(ALL_PERMISSIONS).toContain('reports.view');
    expect(ALL_PERMISSIONS).toContain('reports.export');
    expect(ALL_PERMISSIONS).toContain('settings.manage');
    expect(ALL_PERMISSIONS).toContain('admins.manage');
    expect(ALL_PERMISSIONS).toContain('transactions.approve');
  });

  it('AdminPermission object expõe USERS_MANAGE etc com valores stringificados', () => {
    expect(AdminPermission.USERS_MANAGE).toBe('users.manage');
    expect(AdminPermission.ADMINS_MANAGE).toBe('admins.manage');
  });
});

describe('PERMISSION_CATALOG', () => {
  it('tem 8 entries com key, labelPt, description em PT-BR', () => {
    expect(PERMISSION_CATALOG).toHaveLength(8);
    PERMISSION_CATALOG.forEach((entry) => {
      expect(entry.key).toMatch(/^[a-z]+\.[a-z]+$/);
      expect(typeof entry.labelPt).toBe('string');
      expect(entry.labelPt.length).toBeGreaterThan(0);
      expect(typeof entry.description).toBe('string');
      expect(entry.description.length).toBeGreaterThan(0);
    });
  });

  it('tem entries cobrindo todas as ALL_PERMISSIONS', () => {
    const catalogKeys = PERMISSION_CATALOG.map((e) => e.key);
    ALL_PERMISSIONS.forEach((perm) => {
      expect(catalogKeys).toContain(perm);
    });
  });

  it('labels cobrem os 8 textos do mockup do frontend', () => {
    const labels = PERMISSION_CATALOG.map((e) => e.labelPt);
    expect(labels).toContain('Gerenciar Usuários');
    expect(labels).toContain('Gerenciar Débitos');
    expect(labels).toContain('Gerenciar Pagamentos');
    expect(labels).toContain('Visualizar Relatórios');
    expect(labels).toContain('Exportar Relatórios');
    expect(labels).toContain('Configurar Sistema');
    expect(labels).toContain('Gerenciar Hierarquia ADM');
    expect(labels).toContain('Aprovar Transações');
  });
});

describe('isValidPermission', () => {
  it('retorna true para chaves válidas', () => {
    expect(isValidPermission('users.manage')).toBe(true);
    expect(isValidPermission('admins.manage')).toBe(true);
  });

  it('retorna false para chaves inválidas', () => {
    expect(isValidPermission('foo.bar')).toBe(false);
    expect(isValidPermission('')).toBe(false);
    expect(isValidPermission('USERS.MANAGE')).toBe(false);
  });

  it('serve como type guard', () => {
    const candidate: string = 'users.manage';
    if (isValidPermission(candidate)) {
      // Aqui o TS deve estreitar pra AdminPermission
      const narrowed: typeof AdminPermission[keyof typeof AdminPermission] = candidate;
      expect(narrowed).toBe('users.manage');
    }
  });
});

describe('hasPermission', () => {
  it('retorna true quando o array contém a permissão', () => {
    expect(hasPermission(['users.manage', 'debts.manage'], AdminPermission.USERS_MANAGE)).toBe(true);
  });

  it('retorna false quando o array não contém', () => {
    expect(hasPermission(['users.manage'], AdminPermission.SETTINGS_MANAGE)).toBe(false);
  });

  it('retorna false para array vazio', () => {
    expect(hasPermission([], AdminPermission.USERS_MANAGE)).toBe(false);
  });
});
