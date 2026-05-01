import { Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';
import AppError from '../utils/AppError';
import userRepository from '../repositories/UserRepository';
import type { AdminPermission } from '../types/permissions';

const CACHE_TTL_MS = 60_000;

interface CacheEntry {
  permissions: string[];
  cachedAt: number;
}

const cache = new Map<string, CacheEntry>();

/**
 * Factory de middleware Express que exige uma permissão granular específica.
 * Coexiste com `roleMiddleware` — usado nas rotas admin que migraram para
 * controle por permissão (ver Task 11 do plano).
 *
 * Estratégia de cache: in-memory Map com TTL de 60s por user. Invalidação
 * imediata via `clearPermissionCache(userId)` quando admin altera permissões
 * de outro user (chamado em `UserService.updateAdminPermissions`).
 */
export const requirePermission = (perm: AdminPermission) => {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      throw new AppError('Usuário não autenticado.', StatusCodes.UNAUTHORIZED);
    }

    const userId = req.user.id;
    const now = Date.now();

    let entry = cache.get(userId);
    if (!entry || now - entry.cachedAt > CACHE_TTL_MS) {
      const fresh = await userRepository.findPermissionsById(userId);
      if (!fresh) {
        throw new AppError('Usuário não autenticado.', StatusCodes.UNAUTHORIZED);
      }
      const perms = Array.isArray(fresh.permissions) ? (fresh.permissions as string[]) : [];
      entry = { permissions: perms, cachedAt: now };
      cache.set(userId, entry);
    }

    if (!entry.permissions.includes(perm)) {
      throw new AppError(
        'Você não tem permissão para acessar este recurso.',
        StatusCodes.FORBIDDEN,
      );
    }

    next();
  };
};

/**
 * Invalida cache de permissões de um user específico. Chamado pelo
 * `UserService.updateAdminPermissions` após persistir mudanças, garantindo
 * que próxima request do user vai ler permissões fresh do DB.
 */
export const clearPermissionCache = (userId: string): void => {
  cache.delete(userId);
};
