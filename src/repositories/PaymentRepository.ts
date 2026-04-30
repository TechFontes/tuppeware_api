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

  async findByGatewayTransactionId(gatewayTransactionId: string) {
    return await prisma.payment.findFirst({
      where: { gatewayTransactionId } as Prisma.PaymentWhereInput,
      include: {
        paymentDebts: { include: { debt: true } },
      },
    });
  }

  async findByReferenceNum(referenceNum: string) {
    return await prisma.payment.findFirst({
      where: { referenceNum } as Prisma.PaymentWhereInput,
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

  async countPendingByUser(userId: string) {
    return await prisma.payment.count({
      where: {
        userId,
        status: 'PENDENTE',
      },
    });
  }

  async updateByTid(tid: string, data: Prisma.PaymentUpdateInput) {
    const found = await prisma.payment.findFirst({
      where: { gatewayTransactionId: tid },
      select: { id: true },
    });
    if (!found) { return null; }
    return await prisma.payment.update({ where: { id: found.id }, data });
  }

  async findMany({ where, skip, take }: {
    where?: Prisma.PaymentWhereInput;
    skip?: number;
    take?: number;
  }) {
    const [data, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          paymentDebts: { include: { debt: true } },
          user: { select: { id: true, name: true, email: true, cpf: true } },
        },
      }),
      prisma.payment.count({ where }),
    ]);

    return { data, total };
  }
}

export default new PaymentRepository();
