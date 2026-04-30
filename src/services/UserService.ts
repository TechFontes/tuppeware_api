import bcrypt from 'bcryptjs';
import { StatusCodes } from 'http-status-codes';
import AppError from '../utils/AppError';
import userRepository from '../repositories/UserRepository';
import paymentRepository from '../repositories/PaymentRepository';
import consultantRepository from '../repositories/ConsultantRepository';
import type { Prisma, UserRole } from '../../generated/prisma/client';
import type { PaginationParams } from '../types';

interface ListUsersFilters {
  role?: UserRole;
  grupo?: string;
  distrito?: string;
  isActive?: boolean;
  pagination: PaginationParams;
}

class UserService {
  async findById(id: string) {
    const user = await userRepository.findById(id);

    if (!user) {
      throw new AppError('Usuário não encontrado.', StatusCodes.NOT_FOUND);
    }

    const { password: _, ...sanitized } = user;

    return sanitized;
  }

  async findByEmail(email: string) {
    const user = await userRepository.findByEmail(email);

    if (!user) {
      throw new AppError('Usuário não encontrado.', StatusCodes.NOT_FOUND);
    }

    const { password: _, ...sanitized } = user;

    return sanitized;
  }

  async update(id: string, data: Prisma.UserUpdateInput) {
    const user = await userRepository.findById(id);

    if (!user) {
      throw new AppError('Usuário não encontrado.', StatusCodes.NOT_FOUND);
    }

    const normalized = this._normalizeUpdateData(data);

    const updated = await userRepository.update(id, normalized);
    const { password: _, ...sanitized } = updated;

    return sanitized;
  }

  private _normalizeUpdateData(data: Prisma.UserUpdateInput): Prisma.UserUpdateInput {
    if (!('birthDate' in data) || data.birthDate === undefined) {
      return data;
    }

    const raw = data.birthDate;

    if (raw === null || raw instanceof Date) {
      return data;
    }

    if (typeof raw === 'string') {
      const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw);
      const parsed = new Date(dateOnly ? `${raw}T00:00:00.000Z` : raw);

      if (Number.isNaN(parsed.getTime())) {
        throw new AppError(
          'birthDate inválido. Use o formato YYYY-MM-DD ou ISO-8601.',
          StatusCodes.BAD_REQUEST,
        );
      }

      return { ...data, birthDate: parsed };
    }

    throw new AppError(
      'birthDate inválido. Use o formato YYYY-MM-DD ou ISO-8601.',
      StatusCodes.BAD_REQUEST,
    );
  }

  async findAll() {
    const users = await userRepository.findAll();

    return users.map((user) => {
      const { password: _password, ...rest } = user;

      return rest;
    });
  }

  async listUsers({ role, grupo, distrito, isActive, pagination }: ListUsersFilters) {
    const where: Prisma.UserWhereInput = {};

    if (role) where.role = role;
    if (isActive !== undefined) where.isActive = isActive;

    if (grupo || distrito) {
      const consultantWhere: Prisma.ConsultantWhereInput = {};

      if (grupo) consultantWhere.grupo = grupo;
      if (distrito) consultantWhere.distrito = distrito;

      where.consultant = { is: consultantWhere };
    }

    const { data, total } = await userRepository.findMany({
      where,
      skip: pagination.skip,
      take: pagination.limit,
    });

    return {
      data: data.map(({ password: _, ...u }) => u),
      pagination: {
        total,
        page: pagination.page,
        limit: pagination.limit,
        totalPages: Math.ceil(total / pagination.limit),
        hasNextPage: pagination.skip + pagination.limit < total,
        hasPreviousPage: pagination.page > 1,
      },
    };
  }

  async deactivateUser(id: string) {
    const user = await userRepository.findById(id);

    if (!user) {
      throw new AppError('Usuário não encontrado.', StatusCodes.NOT_FOUND);
    }

    const updated = await userRepository.softDelete(id);
    const { password: _, ...sanitized } = updated;

    return sanitized;
  }

  async getUserPayments(userId: string, pagination: PaginationParams) {
    const user = await userRepository.findById(userId);

    if (!user) {
      throw new AppError('Usuário não encontrado.', StatusCodes.NOT_FOUND);
    }

    return await paymentRepository.findByUserId(userId, {
      skip: pagination.skip,
      take: pagination.limit,
    });
  }

  async createAdmin(data: { name: string; cpf: string; email: string; password: string }) {
    const existing = await userRepository.findByEmail(data.email);

    if (existing) {
      throw new AppError('E-mail já cadastrado.', StatusCodes.CONFLICT);
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);

    const user = await userRepository.create({
      name: data.name,
      cpf: data.cpf,
      email: data.email,
      password: hashedPassword,
      role: 'ADMIN',
    });

    const { password: _, ...sanitized } = user;

    return sanitized;
  }

  async listAdmins(pagination: PaginationParams) {
    const { data, total } = await userRepository.findMany({
      where: { role: 'ADMIN' },
      skip: pagination.skip,
      take: pagination.limit,
    });

    return {
      data: data.map(({ password: _, ...u }) => u),
      pagination: {
        total,
        page: pagination.page,
        limit: pagination.limit,
        totalPages: Math.ceil(total / pagination.limit),
        hasNextPage: pagination.skip + pagination.limit < total,
        hasPreviousPage: pagination.page > 1,
      },
    };
  }

  /**
   * Atualiza grupo/distrito do consultor vinculado ao usuário (admin).
   */
  async updateClientConsultant(userId: string, data: { grupo?: string; distrito?: string }) {
    const user = await this.findById(userId);
    if (user.consultant) {
      await consultantRepository.upsertByCpf({
        codigo: user.consultant.codigo,
        tipo: user.consultant.tipo,
        grupo: data.grupo || user.consultant.grupo,
        distrito: data.distrito || user.consultant.distrito,
        cpf: user.consultant.cpf,
      });
    }
    return this.findById(userId);
  }

  /**
   * Busca consultores por grupo e/ou distrito (admin).
   */
  async getOrganization(params: { grupo?: string; distrito?: string }) {
    if (params.grupo && params.distrito) {
      const byGrupo = await consultantRepository.findByGrupo(params.grupo);
      return byGrupo.filter((c) => c.distrito === params.distrito);
    } else if (params.grupo) {
      return consultantRepository.findByGrupo(params.grupo);
    } else if (params.distrito) {
      return consultantRepository.findByDistrito(params.distrito);
    } else {
      return consultantRepository.findByGrupo('');
    }
  }

  async updateAdmin(id: string, data: { name?: string; email?: string }) {
    const user = await userRepository.findById(id);

    if (!user) {
      throw new AppError('Usuário não encontrado.', StatusCodes.NOT_FOUND);
    }

    if (user.role !== 'ADMIN') {
      throw new AppError('Usuário não é um ADMIN.', StatusCodes.BAD_REQUEST);
    }

    const updated = await userRepository.update(id, data);
    const { password: _, ...sanitized } = updated;

    return sanitized;
  }
}

export default new UserService();
