import prisma from '../config/database';
import type { Prisma } from '../../generated/prisma/client';

class PaymentRepository {
  async create(data: Prisma.PaymentUncheckedCreateInput) {
    return await prisma.payment.create({
      data,
      include: {
        paymentDebts: { include: { debt: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async findById(id: string) {
    return await prisma.payment.findUnique({
      where: { id },
      include: {
        paymentDebts: { include: { debt: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async findByUserId(userId: string, { where = {}, orderBy, skip, take }: {
    where?: Prisma.PaymentWhereInput;
    orderBy?: Prisma.PaymentOrderByWithRelationInput;
    skip?: number;
    take?: number;
  }) {
    const fullWhere: Prisma.PaymentWhereInput = { ...where, userId };

    const [data, total] = await Promise.all([
      prisma.payment.findMany({
        where: fullWhere,
        orderBy: orderBy || { createdAt: 'desc' },
        skip,
        take,
        include: {
          paymentDebts: { include: { debt: true } },
        },
      }),
      prisma.payment.count({ where: fullWhere }),
    ]);

    return { data, total };
  }

  async update(id: string, data: Prisma.PaymentUpdateInput) {
    return await prisma.payment.update({
      where: { id },
      data,
      include: {
        paymentDebts: { include: { debt: true } },
      },
    });
  }

  async findByAsaasId(asaasId: string) {
    return await prisma.payment.findFirst({
      where: { asaasId },
      include: {
        paymentDebts: { include: { debt: true } },
      },
    });
  }

  async countRecentByUser(userId: string, windowMs: number) {
    const since = new Date(Date.now() - windowMs);

    return await prisma.payment.count({
      where: {
        userId,
        createdAt: { gte: since },
      },
    });
  }
}

export default new PaymentRepository();
