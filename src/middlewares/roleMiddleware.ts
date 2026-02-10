import { Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';
import AppError from '../utils/AppError';

/**
 * Middleware de controle de acesso por perfil.
 * Verifica se o usuário autenticado possui uma das roles permitidas.
 * @param allowedRoles - Roles permitidas para a rota
 * @returns Middleware do Express
 */
const roleMiddleware = (...allowedRoles: string[]) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new AppError('Usuário não autenticado.', StatusCodes.UNAUTHORIZED);
    }

    if (!allowedRoles.includes(req.user.role)) {
      throw new AppError(
        'Você não tem permissão para acessar este recurso.',
        StatusCodes.FORBIDDEN,
      );
    }

    next();
  };
};

export { roleMiddleware };
