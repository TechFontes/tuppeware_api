import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import { StatusCodes } from 'http-status-codes';

/**
 * Middleware que verifica os resultados das validações do express-validator.
 * Deve ser usado após os validators nas rotas.
 */
const validate = (req: Request, res: Response, next: NextFunction): void => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    res.status(StatusCodes.BAD_REQUEST).json({
      status: 'fail',
      message: 'Erro de validação.',
      errors: errors.array().map((err) => ({
        field: err.type === 'field' ? err.path : undefined,
        message: err.msg,
      })),
    });

    return;
  }

  next();
};

export { validate };
