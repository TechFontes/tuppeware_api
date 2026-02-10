import jwt from 'jsonwebtoken';
import { StatusCodes } from 'http-status-codes';
import { Request, Response, NextFunction } from 'express';
import AppError from '../utils/AppError';
import { jwtSecret } from '../config/auth';

interface JwtPayload {
  id: string;
  role: string;
  email: string;
}

/**
 * Middleware de autenticação via JWT.
 * Verifica o token no header Authorization (Bearer token).
 */
const authMiddleware = (req: Request, _res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    throw new AppError('Token de autenticação não fornecido.', StatusCodes.UNAUTHORIZED);
  }

  const parts = authHeader.split(' ');

  if (parts.length !== 2 || !/^Bearer$/i.test(parts[0])) {
    throw new AppError('Formato de token inválido.', StatusCodes.UNAUTHORIZED);
  }

  const token = parts[1];

  try {
    const decoded = jwt.verify(token, jwtSecret) as JwtPayload;

    req.user = {
      id: decoded.id,
      role: decoded.role,
      email: decoded.email,
    };

    next();
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'TokenExpiredError') {
      throw new AppError('Token expirado.', StatusCodes.UNAUTHORIZED);
    }

    throw new AppError('Token inválido.', StatusCodes.UNAUTHORIZED);
  }
};

export { authMiddleware };
