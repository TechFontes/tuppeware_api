import { Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';
import userService from '../services/UserService';
import savedCardService from '../services/SavedCardService';
import settingsService from '../services/SettingsService';
import type { Prisma } from '../../generated/prisma/client';

interface PublicSettings {
  partialPaymentEnabled: boolean;
  partialPaymentMinAmount: string | null;
  partialPaymentMinRemaining: string | null;
}

function buildPublicSettings(raw: Record<string, string>): PublicSettings {
  return {
    partialPaymentEnabled: raw.partial_payment_enabled === 'true',
    partialPaymentMinAmount: raw.partial_payment_min_amount ?? null,
    partialPaymentMinRemaining: raw.partial_payment_min_remaining ?? null,
  };
}

class UserController {
  /**
   * GET /api/users/me
   * Retorna o perfil do usuário autenticado e flags públicas do sistema.
   */
  async getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const [user, rawSettings] = await Promise.all([
        userService.findById(req.user!.id),
        settingsService.getAll(),
      ]);

      const data = {
        ...(user as Record<string, unknown>),
        settings: buildPublicSettings(rawSettings),
      };

      res.status(StatusCodes.OK).json({ status: 'success', data });
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

      res.status(StatusCodes.OK).json({ status: 'success', data: user });
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

  /**
   * POST /api/users/me/saved-cards
   * Tokeniza e salva um cartão via eRede.
   */
  async createSavedCard(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { cardNumber, expMonth, expYear, holderName } = req.body as {
        cardNumber: string;
        expMonth: string;
        expYear: string;
        holderName: string;
      };

      const card = await savedCardService.tokenizeAndSave({
        userId: req.user!.id,
        email: req.user!.email,
        cardNumber,
        expMonth,
        expYear,
        holderName,
      });

      res.status(StatusCodes.CREATED).json({ status: 'success', data: card });
    } catch (error) {
      next(error);
    }
  }
}

export default new UserController();
