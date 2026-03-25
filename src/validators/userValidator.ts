import { body } from 'express-validator';

/**
 * Validação para PUT /api/users/me
 * Campos permitidos: name, phone, birthDate, address, addressNumber,
 *   addressComplement, neighbourhood, city, state, postalCode
 * Campos proibidos: email, cpf (não podem ser alterados pelo próprio usuário)
 */
const updateMeValidator = [
  body('email')
    .not()
    .exists()
    .withMessage('E-mail não pode ser alterado por esta rota.'),

  body('cpf')
    .not()
    .exists()
    .withMessage('CPF não pode ser alterado.'),

  body('name')
    .optional()
    .trim()
    .isLength({ min: 3, max: 200 })
    .withMessage('Nome deve ter entre 3 e 200 caracteres.'),

  body('phone')
    .optional()
    .trim()
    .matches(/^\+?[\d\s\-().]{8,20}$/)
    .withMessage('Telefone inválido.'),

  body('birthDate')
    .optional()
    .isISO8601()
    .withMessage('Data de nascimento inválida. Use o formato ISO 8601 (YYYY-MM-DD).'),

  body('address')
    .optional()
    .trim()
    .isLength({ max: 255 })
    .withMessage('Endereço muito longo.'),

  body('addressNumber')
    .optional()
    .trim()
    .isLength({ max: 20 })
    .withMessage('Número do endereço muito longo.'),

  body('addressComplement')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Complemento muito longo.'),

  body('neighbourhood')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Bairro muito longo.'),

  body('city')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Cidade muito longa.'),

  body('state')
    .optional()
    .trim()
    .isLength({ min: 2, max: 2 })
    .withMessage('Estado deve ser a sigla com 2 letras (ex: SP).'),

  body('postalCode')
    .optional()
    .trim()
    .matches(/^\d{5}-?\d{3}$/)
    .withMessage('CEP inválido. Use o formato 00000-000 ou 00000000.'),
];

export { updateMeValidator };
