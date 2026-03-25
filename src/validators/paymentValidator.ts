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

  body('card')
    .if(body('method').equals('CARTAO_CREDITO'))
    .isObject()
    .withMessage('Dados do cartão são obrigatórios para pagamento com cartão.'),

  body('card.number')
    .if(body('method').equals('CARTAO_CREDITO'))
    .isString()
    .withMessage('Número do cartão é obrigatório.'),

  body('card.expMonth')
    .if(body('method').equals('CARTAO_CREDITO'))
    .isString()
    .withMessage('Mês de expiração é obrigatório.'),

  body('card.expYear')
    .if(body('method').equals('CARTAO_CREDITO'))
    .isString()
    .withMessage('Ano de expiração é obrigatório.'),

  body('card.cvv')
    .if(body('method').equals('CARTAO_CREDITO'))
    .isString()
    .withMessage('CVV é obrigatório.'),

  body('card.holderName')
    .if(body('method').equals('CARTAO_CREDITO'))
    .isString()
    .withMessage('Nome do titular é obrigatório.'),

  body('billing')
    .isObject()
    .withMessage('Dados de billing são obrigatórios.'),

  body('billing.name')
    .isString()
    .withMessage('Nome no billing é obrigatório.'),

  body('billing.email')
    .isEmail()
    .withMessage('Email no billing é obrigatório e deve ser válido.'),

  body('billing.phone')
    .isString()
    .withMessage('Telefone no billing é obrigatório.'),

  body('billing.document')
    .isString()
    .withMessage('Documento no billing é obrigatório.'),

  body('billing.birthDate')
    .isISO8601()
    .withMessage('Data de nascimento no billing deve estar no formato YYYY-MM-DD.'),

  body('billing.address')
    .isString()
    .withMessage('Endereço no billing é obrigatório.'),

  body('billing.district')
    .isString()
    .withMessage('Bairro no billing é obrigatório.'),

  body('billing.city')
    .isString()
    .withMessage('Cidade no billing é obrigatória.'),

  body('billing.state')
    .isString()
    .withMessage('Estado no billing é obrigatório.'),

  body('billing.postalcode')
    .isString()
    .withMessage('CEP no billing é obrigatório.'),
];

export { createPaymentValidator };
