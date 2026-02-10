import { Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';
import AppError from '../utils/AppError';

/**
 * Middleware de validação para upload de arquivo CSV.
 * Verifica se o arquivo foi enviado e se é do tipo correto.
 */
const csvUploadValidator = (req: Request, _res: Response, next: NextFunction): void => {
  if (!req.file) {
    throw new AppError('Arquivo CSV é obrigatório.', StatusCodes.BAD_REQUEST);
  }

  const allowedMimeTypes = ['text/csv', 'text/plain', 'application/vnd.ms-excel'];

  if (!allowedMimeTypes.includes(req.file.mimetype)) {
    throw new AppError(
      'Formato de arquivo inválido. Envie um arquivo CSV.',
      StatusCodes.BAD_REQUEST,
    );
  }

  next();
};

export { csvUploadValidator };
