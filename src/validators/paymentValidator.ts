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

  body('savedCardId')
    .optional()
    .isUUID()
    .withMessage('ID do cartão salvo deve ser um UUID válido.'),

  // Card fields obrigatórios apenas quando method=CARTAO_CREDITO e sem savedCardId
  body('card')
    .if(body('method').equals('CARTAO_CREDITO'))
    .if((value: unknown, { req }: any) => !req.body.savedCardId)
    .isObject()
    .withMessage('Dados do cartão são obrigatórios para pagamento com cartão.'),

  body('card.number')
    .if(body('method').equals('CARTAO_CREDITO'))
    .if((value: unknown, { req }: any) => !req.body.savedCardId)
    .isString()
    .withMessage('Número do cartão é obrigatório.'),

  body('card.expMonth')
    .if(body('method').equals('CARTAO_CREDITO'))
    .if((value: unknown, { req }: any) => !req.body.savedCardId)
    .isString()
    .withMessage('Mês de expiração é obrigatório.'),

  body('card.expYear')
    .if(body('method').equals('CARTAO_CREDITO'))
    .if((value: unknown, { req }: any) => !req.body.savedCardId)
    .isString()
    .withMessage('Ano de expiração é obrigatório.'),

  // CVV obrigatório para CARTAO_CREDITO (com ou sem savedCardId)
  body('card.cvv')
    .if(body('method').equals('CARTAO_CREDITO'))
    .isString()
    .withMessage('CVV é obrigatório.'),

  body('card.holderName')
    .if(body('method').equals('CARTAO_CREDITO'))
    .if((value: unknown, { req }: any) => !req.body.savedCardId)
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

  // birthDate é opcional — eRede v2 não exige (validado em sandbox 2026-05-01:
  // POST /v2/transactions retornou returnCode 00 sem o campo). Mantido como
  // opcional pra back-compat com clients que ainda enviam.
  body('billing.birthDate')
    .optional()
    .isISO8601()
    .withMessage('Quando enviado, birthDate deve estar no formato YYYY-MM-DD.'),

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
