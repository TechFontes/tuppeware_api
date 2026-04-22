import prisma from '../config/database';
import type { Debt, Prisma } from '../../generated/prisma/client';

class DebtRepository {
  async create(data: Prisma.DebtUncheckedCreateInput): Promise<Debt> {
    return await prisma.debt.create({ data });
  }

  async findById(id: string) {
    return await prisma.debt.findUnique({
      where: { id },
      include: { paymentDebts: { include: { payment: true } } },
    });
  }

  async findMany({ where, orderBy, skip, take }: {
    where: Prisma.DebtWhereInput;
    orderBy?: Prisma.DebtOrderByWithRelationInput;
    skip?: number;
    take?: number;
  }): Promise<{ data: Debt[]; total: number }> {
    const [data, total] = await Promise.all([
      prisma.debt.findMany({
        where,
        orderBy,
        skip,
        take,
      }),
      prisma.debt.count({ where }),
    ]);

    return { data, total };
  }

  async update(id: string, data: Prisma.DebtUpdateInput): Promise<Debt> {
    return await prisma.debt.update({
      where: { id },
      data,
    });
  }

  async updateMany(where: Prisma.DebtWhereInput, data: Prisma.DebtUpdateManyMutationInput) {
    return await prisma.debt.updateMany({
      where,
      data,
    });
  }

  async upsertByNf(data: Prisma.DebtUncheckedCreateInput): Promise<Debt> {
    return await prisma.debt.upsert({
      where: {
        numeroNf: String(data.numeroNf),
      },
      update: {
        codigo: data.codigo,
        nome: data.nome,
        grupo: data.grupo,
        distrito: data.distrito,
        semana: data.semana,
        valor: data.valor,
        diasAtraso: data.diasAtraso,
        dataVencimento: data.dataVencimento,
        status: data.status,
      },
      create: data,
    });
  }

  async createMany(data: Prisma.DebtCreateManyInput[]) {
    return await prisma.debt.createMany({
      data,
      skipDuplicates: true,
    });
  }

  async findByIds(ids: string[]): Promise<Debt[]> {
    return await prisma.debt.findMany({
      where: { id: { in: ids } },
    });
  }

  async updateDebtPaidAmount(
    debtId: string,
    expectedCurrentPaidAmount: Prisma.Decimal | string,
    newPaidAmount: Prisma.Decimal | string,
    newStatus: 'PENDENTE' | 'ATRASADO' | 'PAGO',
  ): Promise<boolean> {
    const result = await prisma.debt.updateMany({
      where: { id: debtId, paidAmount: expectedCurrentPaidAmount as any },
      data: { paidAmount: newPaidAmount as any, status: newStatus },
    });
    return result.count === 1;
  }
}

export default new DebtRepository();
