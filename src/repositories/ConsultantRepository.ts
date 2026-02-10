import prisma from '../config/database';
import type { Consultant, Prisma } from '../../generated/prisma/client';

class ConsultantRepository {
  async create(data: Prisma.ConsultantCreateInput): Promise<Consultant> {
    return await prisma.consultant.create({ data });
  }

  async upsertByCpf(data: {
    codigo: string;
    tipo: number;
    grupo: string;
    distrito: string;
    cpf: string;
  }): Promise<Consultant> {
    return await prisma.consultant.upsert({
      where: { cpf: data.cpf },
      update: {
        codigo: data.codigo,
        tipo: data.tipo,
        grupo: data.grupo,
        distrito: data.distrito,
      },
      create: data,
    });
  }

  async findByCpf(cpf: string) {
    return await prisma.consultant.findUnique({
      where: { cpf },
      include: { user: true },
    });
  }

  async findByCodigo(codigo: string) {
    return await prisma.consultant.findUnique({
      where: { codigo },
      include: { user: true },
    });
  }

  async findByGrupo(grupo: string) {
    return await prisma.consultant.findMany({
      where: { grupo },
      include: { user: true },
    });
  }

  async findByDistrito(distrito: string) {
    return await prisma.consultant.findMany({
      where: { distrito },
      include: { user: true },
    });
  }

  async linkToUser(consultantId: string, userId: string) {
    return await prisma.consultant.update({
      where: { id: consultantId },
      data: { userId },
    });
  }

  async createMany(data: Array<{
    codigo: string;
    tipo: number;
    grupo: string;
    distrito: string;
    cpf: string;
  }>): Promise<Consultant[]> {
    const results: Consultant[] = [];

    for (const item of data) {
      const result = await this.upsertByCpf(item);

      results.push(result);
    }

    return results;
  }
}

export default new ConsultantRepository();
