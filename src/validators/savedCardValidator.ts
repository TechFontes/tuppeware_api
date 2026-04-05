import { body } from 'express-validator';

const createSavedCardValidator = [
  body('cardNumber')
    .isString()
    .withMessage('Número do cartão é obrigatório.')
    .matches(/^\d{13,19}$/)
    .withMessage('Número do cartão deve ter entre 13 e 19 dígitos numéricos.'),

  body('expMonth')
    .isString()
    .withMessage('Mês de expiração é obrigatório.')
    .matches(/^(0[1-9]|1[0-2])$/)
    .withMessage('Mês de expiração deve ser entre 01 e 12.'),

  body('expYear')
    .isString()
    .withMessage('Ano de expiração é obrigatório.')
    .matches(/^\d{4}$/)
    .withMessage('Ano de expiração deve ter 4 dígitos.'),

  body('holderName')
    .isString()
    .withMessage('Nome do titular é obrigatório.')
    .isLength({ min: 2 })
    .withMessage('Nome do titular deve ter pelo menos 2 caracteres.'),
];

export { createSavedCardValidator };
