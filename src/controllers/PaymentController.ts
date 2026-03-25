import { Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';
import paymentService from '../services/PaymentService';
import type { ERedeCallbackPayload } from '../types';

class PaymentController {
  /**
   * POST /api/payments
   * Cria um pagamento e envia para a eRede.
   */
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const payment = await paymentService.create(req.user!.id, req.body);

      res.status(StatusCodes.CREATED).json({
        status: 'success',
        message: 'Pagamento processado no gateway com sucesso.',
        data: payment,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/payments/callback/erede
   * Endpoint de callback assíncrono da eRede.
   */
  async eredeCallback(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await paymentService.processGatewayCallback(req.body as ERedeCallbackPayload);

      res.status(StatusCodes.OK).json({
        status: 'success',
        message: 'Callback processado com sucesso.',
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new PaymentController();
