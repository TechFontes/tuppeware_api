import { StatusCodes } from 'http-status-codes';
import AppError from '../utils/AppError';
import userRepository from '../repositories/UserRepository';
import type { Prisma } from '../../generated/prisma/client';

class UserService {
  /**
   * Busca um usuário pelo ID.
   */
  async findById(id: string) {
    const user = await userRepository.findById(id);

    if (!user) {
      throw new AppError('Usuário não encontrado.', StatusCodes.NOT_FOUND);
    }

    const { password: _, ...sanitized } = user;

    return sanitized;
  }

  /**
   * Busca um usuário pelo e-mail.
   */
  async findByEmail(email: string) {
    const user = await userRepository.findByEmail(email);

    if (!user) {
      throw new AppError('Usuário não encontrado.', StatusCodes.NOT_FOUND);
    }

    const { password: _, ...sanitized } = user;

    return sanitized;
  }

  /**
   * Atualiza dados do usuário.
   */
  async update(id: string, data: Prisma.UserUpdateInput) {
    const user = await userRepository.findById(id);

    if (!user) {
      throw new AppError('Usuário não encontrado.', StatusCodes.NOT_FOUND);
    }

    const updated = await userRepository.update(id, data);
    const { password: _, ...sanitized } = updated;

    return sanitized;
  }

  /**
   * Lista todos os usuários (admin).
   */
  async findAll() {
    const users = await userRepository.findAll();

    return users.map((user) => {
      const { password: _password, ...rest } = user;

      return rest;
    });
  }
}

export default new UserService();
