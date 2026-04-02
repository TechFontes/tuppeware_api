import { StatusCodes } from 'http-status-codes';
import AppError from '../utils/AppError';
import { getPaginationParams, paginatedResponse } from '../utils/pagination';
import debtRepository from '../repositories/DebtRepository';
import consultantRepository from '../repositories/ConsultantRepository';
import type { Prisma } from '../../generated/prisma/client';

interface DebtUser {
  role: string;
  cpf: string;
}

interface DebtQuery {
  page?: string;
  limit?: string;
  search?: string;
  grupo?: string;
  distrito?: string;
  status?: string;
  dataVencimentoInicio?: string;
  dataVencimentoFim?: string;
  valorMin?: string;
  valorMax?: string;
  sortBy?: string;
  sortOrder?: string;
}

class DebtService {
  /**
   * Lista débitos com filtros, ordenação e paginação.
   * Respeita a hierarquia de visualização:
   * - ADMIN: todos os débitos
   * - EMPRESARIA: débitos do seu distrito
   * - LIDER: débitos do seu grupo
   * - CONSULTOR: apenas débitos vinculados ao seu código
   */
  async list(user: DebtUser, query: DebtQuery) {
    const { page, limit, skip } = getPaginationParams(query as Record<string, string | undefined>);
    const where = await this._buildWhereClause(user, query);
    const orderBy = this._buildOrderBy(query);

    const { data, total } = await debtRepository.findMany({
      where,
      orderBy,
      skip,
      take: limit,
    });

    return paginatedResponse(data, total, page, limit);
  }

  /**
   * Busca um débito pelo ID.
   */
  async findById(id: string) {
    const debt = await debtRepository.findById(id);

    if (!debt) {
      throw new AppError('Débito não encontrado.', StatusCodes.NOT_FOUND);
    }

    return debt;
  }

  /**
   * Busca débito por ID verificando autorização hierárquica do usuário.
   */
  async authorizedFindById(id: string, user: DebtUser) {
    const debt = await this.findById(id);

    // ADMIN e GERENTE podem ver qualquer débito
    if (user.role === 'ADMIN' || user.role === 'GERENTE') {
      return debt;
    }

    // Roles hierárquicas precisam do consultor vinculado
    const consultant = await consultantRepository.findByCpf(user.cpf);

    if (!consultant) {
      throw new AppError('Consultor não vinculado.', StatusCodes.FORBIDDEN);
    }

    const allowed =
      (user.role === 'CONSULTOR' && (debt as any).codigo === consultant.codigo) ||
      (user.role === 'LIDER' && (debt as any).grupo === consultant.grupo) ||
      (user.role === 'EMPRESARIA' && (debt as any).distrito === consultant.distrito);

    if (!allowed) {
      throw new AppError('Acesso negado a este débito.', StatusCodes.FORBIDDEN);
    }

    return debt;
  }

  /**
   * Cria ou atualiza um débito (admin).
   */
  async adminCreateDebt(data: {
    codigo: string;
    nome: string;
    grupo: string;
    distrito: string;
    semana: string;
    valor: number;
    dataVencimento: Date;
    numeroNf: string;
    status: 'PENDENTE' | 'ATRASADO' | 'PAGO';
  }) {
    return debtRepository.upsertByNf({
      ...data,
      diasAtraso: 0,
    });
  }

  /**
   * Atualiza o status de um débito (admin).
   */
  async adminUpdateDebtStatus(id: string, status: 'PENDENTE' | 'ATRASADO' | 'PAGO') {
    return debtRepository.update(id, { status });
  }

  /**
   * Lista débitos por semana (admin).
   */
  async listByWeek(semana?: string) {
    const where = semana ? { semana } : {};
    return debtRepository.findMany({ where });
  }

  /**
   * Lista débitos pagos hoje (admin).
   */
  async listPaidToday() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return debtRepository.findMany({
      where: {
        status: 'PAGO',
        updatedAt: { gte: today, lt: tomorrow },
      },
    });
  }

  /**
   * Constrói a cláusula WHERE baseada na hierarquia e filtros.
   */
  private async _buildWhereClause(user: DebtUser, query: DebtQuery): Promise<Prisma.DebtWhereInput> {
    const where: Prisma.DebtWhereInput = {};

    // Filtros hierárquicos baseados no perfil
    if (user.role === 'EMPRESARIA') {
      const consultant = await consultantRepository.findByCpf(user.cpf);

      if (!consultant) {
        throw new AppError('Consultor não vinculado.', StatusCodes.FORBIDDEN);
      }

      where.distrito = consultant.distrito;
    } else if (user.role === 'LIDER') {
      const consultant = await consultantRepository.findByCpf(user.cpf);

      if (!consultant) {
        throw new AppError('Consultor não vinculado.', StatusCodes.FORBIDDEN);
      }

      where.grupo = consultant.grupo;
    } else if (user.role === 'CONSULTOR') {
      const consultant = await consultantRepository.findByCpf(user.cpf);

      if (!consultant) {
        throw new AppError('Consultor não vinculado.', StatusCodes.FORBIDDEN);
      }

      where.codigo = consultant.codigo;
    }
    // ADMIN: sem filtro hierárquico

    // Filtros da query string
    if (query.search) {
      const searchLower = query.search.toLowerCase();

      where.OR = [
        { nome: { contains: searchLower } },
        { nome: { contains: query.search } },
        { numeroNf: { contains: searchLower } },
        { numeroNf: { contains: query.search } },
      ];
    }

    // Filtros de grupo e distrito apenas para ADMIN
    // Roles hierárquicos já têm restrição aplicada acima e não podem ser sobrescritos
    if (user.role === 'ADMIN') {
      if (query.grupo) {
        where.grupo = query.grupo;
      }

      if (query.distrito) {
        where.distrito = query.distrito;
      }
    }

    if (query.status) {
      where.status = query.status as Prisma.EnumDebtStatusFilter;
    }

    if (query.dataVencimentoInicio || query.dataVencimentoFim) {
      where.dataVencimento = {};

      if (query.dataVencimentoInicio) {
        (where.dataVencimento as Prisma.DateTimeFilter).gte = new Date(query.dataVencimentoInicio);
      }

      if (query.dataVencimentoFim) {
        (where.dataVencimento as Prisma.DateTimeFilter).lte = new Date(query.dataVencimentoFim);
      }
    }

    if (query.valorMin || query.valorMax) {
      where.valor = {};

      if (query.valorMin) {
        (where.valor as Prisma.DecimalFilter).gte = parseFloat(query.valorMin);
      }

      if (query.valorMax) {
        (where.valor as Prisma.DecimalFilter).lte = parseFloat(query.valorMax);
      }
    }

    return where;
  }

  /**
   * Constrói a ordenação baseada nos parâmetros da query.
   */
  private _buildOrderBy(query: DebtQuery): Prisma.DebtOrderByWithRelationInput {
    const allowedFields: Record<string, string> = {
      nome: 'nome',
      valor: 'valor',
      dataVencimento: 'dataVencimento',
      status: 'status',
      diasAtraso: 'diasAtraso',
    };

    const field = allowedFields[query.sortBy || ''] || 'dataVencimento';
    const direction = query.sortOrder === 'asc' ? 'asc' : 'desc';

    return { [field]: direction } as Prisma.DebtOrderByWithRelationInput;
  }
}

export default new DebtService();
