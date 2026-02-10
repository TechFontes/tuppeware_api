import { body } from 'express-validator';

const createPaymentValidator = [
  body('debtIds')
    .isArray({ min: 1 })
    .withMessage('Selecione pelo menos um débito.'),

  body('debtIds.*')
    .isUUID()
    .withMessage('ID de débito inválido.'),

  body('method')
    .notEmpty()
    .withMessage('Método de pagamento é obrigatório.')
    .isIn(['PIX', 'CARTAO_CREDITO'])
    .withMessage('Método de pagamento inválido. Use PIX ou CARTAO_CREDITO.'),

  body('installments')
    .optional()
    .isInt({ min: 1, max: 3 })
    .withMessage('Número de parcelas deve ser entre 1 e 3.'),
];

export { createPaymentValidator };
