import { Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';
import paymentService from '../services/PaymentService';

class PaymentHistoryController {
  /**
   * GET /api/payment-history
   * Lista o histórico de pagamentos do usuário autenticado.
   */
  async index(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await paymentService.getHistory(req.user!.id, req.query as Record<string, string>);

      res.status(StatusCodes.OK).json({
        status: 'success',
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/payment-history/:id
   * Busca detalhes de um pagamento específico.
   */
  async show(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const payment = await paymentService.getById(req.user!.id, req.params.id as string);

      res.status(StatusCodes.OK).json({
        status: 'success',
        data: payment,
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new PaymentHistoryController();
