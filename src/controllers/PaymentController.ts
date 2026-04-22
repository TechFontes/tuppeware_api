import { Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';
import paymentService from '../services/PaymentService';
import AppError from '../utils/AppError';
import type { ERedeCallbackPayload } from '../types';

class PaymentController {
  /**
   * POST /api/payments/partial
   * Cria um pagamento parcial PIX para uma única dívida.
   */
  async createPartial(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = (req as any).user;
      const result = await paymentService.createPartial(user.id, req.body, user);
      res.status(StatusCodes.CREATED).json(result);
    } catch (err) {
      next(err);
    }
  }

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
      const callbackSecret = process.env.EREDE_CALLBACK_SECRET;

      if (callbackSecret) {
        const headerSecret = req.headers['x-erede-secret'];
        if (!headerSecret || headerSecret !== callbackSecret) {
          throw new AppError('Acesso não autorizado ao callback.', StatusCodes.BAD_REQUEST);
        }
      }

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
