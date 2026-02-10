import prisma from '../config/database';
import type { User, Prisma } from '../../generated/prisma/client';

class UserRepository {
  async create(data: Prisma.UserCreateInput): Promise<User> {
    return await prisma.user.create({ data });
  }

  async findById(id: string) {
    return await prisma.user.findUnique({
      where: { id },
      include: { consultant: true },
    });
  }

  async findByEmail(email: string) {
    return await prisma.user.findUnique({
      where: { email },
      include: { consultant: true },
    });
  }

  async findByCpf(cpf: string) {
    return await prisma.user.findUnique({
      where: { cpf },
      include: { consultant: true },
    });
  }

  async update(id: string, data: Prisma.UserUpdateInput): Promise<User> {
    return await prisma.user.update({
      where: { id },
      data,
    });
  }

  async delete(id: string): Promise<User> {
    return await prisma.user.delete({
      where: { id },
    });
  }

  async findAll() {
    return await prisma.user.findMany({
      include: { consultant: true },
      orderBy: { createdAt: 'desc' },
    });
  }
}

export default new UserRepository();
