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

  /**
   * Lightweight lookup usado pelo permissionMiddleware (hot path).
   * Retorna apenas id, permissions e role — sem join com consultant.
   */
  async findPermissionsById(id: string): Promise<{
    id: string;
    permissions: unknown;
    role: string;
  } | null> {
    return await prisma.user.findUnique({
      where: { id },
      select: { id: true, permissions: true, role: true },
    });
  }

  async update(id: string, data: Prisma.UserUpdateInput): Promise<User> {
    return await prisma.user.update({
      where: { id },
      data,
    });
  }

  async softDelete(id: string): Promise<User> {
    return await prisma.user.update({
      where: { id },
      data: { isActive: false },
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

  async findMany({ where, orderBy, skip, take }: {
    where?: Prisma.UserWhereInput;
    orderBy?: Prisma.UserOrderByWithRelationInput;
    skip?: number;
    take?: number;
  }) {
    const [data, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: orderBy || { createdAt: 'desc' },
        skip,
        take,
        include: { consultant: true },
      }),
      prisma.user.count({ where }),
    ]);

    return { data, total };
  }
}

export default new UserRepository();
