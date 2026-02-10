import { Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';
import AppError from '../utils/AppError';

interface PrismaError extends Error {
  code?: string;
  meta?: { target?: string[] };
}

interface ParseError extends Error {
  type?: string;
  code?: string;
}

/**
 * Middleware centralizado de tratamento de erros.
 * Captura todos os erros da aplicação e retorna resposta padronizada.
 */
const errorHandler = (err: Error, _req: Request, res: Response, _next: NextFunction): void => {
  // Erro operacional (AppError) - esperado
  if (err instanceof AppError) {
    const body: Record<string, unknown> = {
      status: err.status,
      message: err.message,
    };

    if (err.details) {
      body.details = err.details;
    }

    res.status(err.statusCode).json(body);

    return;
  }

  // Erros do Prisma
  const prismaError = err as PrismaError;

  if (prismaError.code === 'P2002') {
    const field = prismaError.meta?.target?.[0] || 'campo';

    res.status(StatusCodes.CONFLICT).json({
      status: 'fail',
      message: `Já existe um registro com este ${field}.`,
    });

    return;
  }

  if (prismaError.code === 'P2025') {
    res.status(StatusCodes.NOT_FOUND).json({
      status: 'fail',
      message: 'Registro não encontrado.',
    });

    return;
  }

  // Erro de validação do express-validator
  const parseError = err as ParseError;

  if (parseError.type === 'entity.parse.failed') {
    res.status(StatusCodes.BAD_REQUEST).json({
      status: 'fail',
      message: 'JSON inválido no corpo da requisição.',
    });

    return;
  }

  // Erro do Multer (upload de arquivos)
  if (parseError.code === 'LIMIT_FILE_SIZE') {
    res.status(StatusCodes.BAD_REQUEST).json({
      status: 'fail',
      message: 'Arquivo excede o tamanho máximo permitido.',
    });

    return;
  }

  // Erro inesperado - logar e retornar mensagem genérica
  console.error('Erro não tratado:', err);

  res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
    status: 'error',
    message: 'Erro interno do servidor.',
    ...(process.env.NODE_ENV === 'development' && {
      error: err.message,
      stack: err.stack,
    }),
  });
};

export { errorHandler };
