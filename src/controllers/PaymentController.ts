import { Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';
import paymentService from '../services/PaymentService';

class PaymentController {
  /**
   * POST /api/payments
   * Cria um pagamento e gera link de pagamento via Asaas.
   */
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { debtIds, method, installments } = req.body;

      const payment = await paymentService.create(req.user!.id, {
        debtIds,
        method,
        installments: installments || 1,
      });

      res.status(StatusCodes.CREATED).json({
        status: 'success',
        message: 'Link de pagamento gerado com sucesso.',
        data: payment,
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new PaymentController();
