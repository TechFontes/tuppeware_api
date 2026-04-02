import { Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';
import { StatusCodes as HTTP } from 'http-status-codes';
import userService from '../services/UserService';
import savedCardService from '../services/SavedCardService';
import type { Prisma } from '../../generated/prisma/client';

class UserController {
  /**
   * GET /api/users/me
   * Retorna o perfil do usuário autenticado, incluindo dados de consultor se vinculado.
   */
  async getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = await userService.findById(req.user!.id);

      res.status(StatusCodes.OK).json({ status: 'success', data: user });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/users/me
   * Edita dados do próprio perfil. Proibido alterar email e CPF.
   */
  async updateMe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const allowedFields: (keyof Prisma.UserUpdateInput)[] = [
        'name',
        'phone',
        'birthDate',
        'address',
        'addressNumber',
        'addressComplement',
        'neighbourhood',
        'city',
        'state',
        'postalCode',
      ];

      const updateData: Prisma.UserUpdateInput = {};

      for (const field of allowedFields) {
        const body = req.body as Record<string, unknown>;

        if (body[field] !== undefined) {
          (updateData as Record<string, unknown>)[field] = body[field];
        }
      }

      const user = await userService.update(req.user!.id, updateData);

      res.status(HTTP.OK).json({ status: 'success', data: user });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/users/me/saved-cards
   * Lista os cartões salvos do usuário autenticado.
   */
  async getSavedCards(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const cards = await savedCardService.listByUser(req.user!.id);

      res.status(StatusCodes.OK).json({ status: 'success', data: cards });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/users/me/saved-cards/:id
   * Remove um cartão salvo do usuário autenticado.
   */
  async deleteSavedCard(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await savedCardService.deleteCard(req.user!.id, String(req.params.id));

      res.status(StatusCodes.NO_CONTENT).send();
    } catch (error) {
      next(error);
    }
  }
}

export default new UserController();
