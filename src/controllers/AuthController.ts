import { Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';
import authService from '../services/AuthService';

class AuthController {
  /**
   * POST /api/auth/register
   * Cadastra um novo usuário.
   */
  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { name, cpf, email, password } = req.body;
      const result = await authService.register({ name, cpf, email, password });

      res.status(StatusCodes.CREATED).json({
        status: 'success',
        message: 'Usuário cadastrado com sucesso.',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/auth/login
   * Realiza o login do usuário.
   */
  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, password } = req.body;
      const result = await authService.login({ email, password });

      res.status(StatusCodes.OK).json({
        status: 'success',
        message: 'Login realizado com sucesso.',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/auth/forgot-password
   * Solicita recuperação de senha.
   */
  async forgotPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email } = req.body;
      const result = await authService.forgotPassword(email);

      res.status(StatusCodes.OK).json({
        status: 'success',
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/auth/reset-password
   * Redefine a senha do usuário.
   */
  async resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { token, password } = req.body;
      const result = await authService.resetPassword(token, password);

      res.status(StatusCodes.OK).json({
        status: 'success',
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new AuthController();
