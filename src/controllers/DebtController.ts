import { Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';
import debtService from '../services/DebtService';
import userService from '../services/UserService';

class DebtController {
  /**
   * GET /api/debts
   * Lista débitos com filtros, ordenação e paginação.
   * Respeita hierarquia de acesso.
   */
  async index(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Busca dados completos do usuário (com CPF para filtro hierárquico)
      const user = await userService.findById(req.user!.id);
      const result = await debtService.list(user, req.query as Record<string, string>);

      res.status(StatusCodes.OK).json({
        status: 'success',
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/debts/:id
   * Busca um débito pelo ID.
   */
  async show(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const debt = await debtService.findById(req.params.id as string);

      res.status(StatusCodes.OK).json({
        status: 'success',
        data: debt,
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new DebtController();
