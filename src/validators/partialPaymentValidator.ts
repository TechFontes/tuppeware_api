import { Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';
import AppError from '../utils/AppError';

export default function partialPaymentValidator(req: Request, _res: Response, next: NextFunction) {
  const { debtId, amount } = req.body ?? {};

  if (typeof debtId !== 'string' || debtId.length === 0) {
    return next(new AppError('debtId é obrigatório', StatusCodes.BAD_REQUEST));
  }
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    return next(new AppError('amount deve ser número positivo', StatusCodes.BAD_REQUEST));
  }
  if (Math.round(amount * 100) / 100 !== amount) {
    return next(new AppError('amount aceita até 2 casas decimais', StatusCodes.BAD_REQUEST));
  }
  next();
}
