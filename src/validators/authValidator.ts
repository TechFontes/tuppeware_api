import { body } from 'express-validator';
import { isValidCPF } from '../utils/cpfValidator';

const registerValidator = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Nome é obrigatório.')
    .isLength({ min: 3, max: 200 })
    .withMessage('Nome deve ter entre 3 e 200 caracteres.'),

  body('cpf')
    .trim()
    .notEmpty()
    .withMessage('CPF é obrigatório.')
    .custom((value: string) => {
      if (!isValidCPF(value)) {
        throw new Error('CPF inválido.');
      }

      return true;
    }),

  body('email')
    .trim()
    .notEmpty()
    .withMessage('E-mail é obrigatório.')
    .isEmail()
    .withMessage('E-mail inválido.')
    .normalizeEmail(),

  body('password')
    .notEmpty()
    .withMessage('Senha é obrigatória.')
    .isLength({ min: 6 })
    .withMessage('Senha deve ter no mínimo 6 caracteres.'),
];

const loginValidator = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage('E-mail é obrigatório.')
    .isEmail()
    .withMessage('E-mail inválido.')
    .normalizeEmail(),

  body('password').notEmpty().withMessage('Senha é obrigatória.'),
];

const forgotPasswordValidator = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage('E-mail é obrigatório.')
    .isEmail()
    .withMessage('E-mail inválido.')
    .normalizeEmail(),
];

const resetPasswordValidator = [
  body('token').trim().notEmpty().withMessage('Token é obrigatório.'),

  body('password')
    .notEmpty()
    .withMessage('Nova senha é obrigatória.')
    .isLength({ min: 6 })
    .withMessage('Senha deve ter no mínimo 6 caracteres.'),
];

export {
  registerValidator,
  loginValidator,
  forgotPasswordValidator,
  resetPasswordValidator,
};
