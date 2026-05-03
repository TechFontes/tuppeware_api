import { Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';
import { body } from 'express-validator';
import AppError from '../utils/AppError';
import { ALL_PERMISSIONS } from '../types/permissions';

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

/**
 * Validador para POST /admin/managers — criação de usuário ADMIN.
 * jobTitle e permissions são opcionais; se permissions vier, cada item
 * deve estar no catálogo (anti-escalada validada no service).
 */
const createManagerValidator = [
  body('name').isString().trim().notEmpty().withMessage('Nome é obrigatório.'),
  body('cpf')
    .isString()
    .matches(/^\d{11}$|^\d{3}\.\d{3}\.\d{3}-\d{2}$/)
    .withMessage('CPF é obrigatório e deve ter 11 dígitos (com ou sem pontuação).'),
  body('email').isEmail().withMessage('Email é obrigatório e deve ser válido.'),
  body('password')
    .isString()
    .isLength({ min: 8 })
    .withMessage('Senha deve ter no mínimo 8 caracteres.'),
  body('jobTitle').optional().isString().withMessage('jobTitle deve ser string.'),
  body('permissions').optional().isArray().withMessage('permissions deve ser um array.'),
  body('permissions.*')
    .optional()
    .isString()
    .isIn(ALL_PERMISSIONS)
    .withMessage('Permissão inválida.'),
];

/**
 * Validador para POST /admin/debts — criação manual de débito.
 */
const createDebtValidator = [
  body('codigo').isString().trim().notEmpty().withMessage('Código é obrigatório.'),
  body('nome').isString().trim().notEmpty().withMessage('Nome é obrigatório.'),
  body('grupo').optional().isString(),
  body('distrito').optional().isString(),
  body('semana').optional().isString(),
  body('valor').isFloat({ gt: 0 }).withMessage('Valor é obrigatório e deve ser positivo.'),
  body('dataVencimento')
    .isISO8601()
    .withMessage('dataVencimento é obrigatória e deve estar no formato ISO 8601 (YYYY-MM-DD ou completo).'),
  body('numeroNf').isString().trim().notEmpty().withMessage('numeroNf é obrigatório.'),
  body('status')
    .optional()
    .isIn(['PENDENTE', 'ATRASADO', 'PAGO'])
    .withMessage('Status deve ser PENDENTE, ATRASADO ou PAGO.'),
];

/**
 * Validador para PATCH /admin/debts/:id/status.
 */
const updateDebtStatusValidator = [
  body('status')
    .isIn(['PENDENTE', 'ATRASADO', 'PAGO'])
    .withMessage('Status é obrigatório e deve ser PENDENTE, ATRASADO ou PAGO.'),
];

export {
  csvUploadValidator,
  createManagerValidator,
  createDebtValidator,
  updateDebtStatusValidator,
};
