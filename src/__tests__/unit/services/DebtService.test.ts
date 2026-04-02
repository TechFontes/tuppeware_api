import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StatusCodes } from 'http-status-codes';

vi.mock('../../../repositories/DebtRepository', () => ({
  default: { findMany: vi.fn(), findById: vi.fn() },
}));

vi.mock('../../../repositories/ConsultantRepository', () => ({
  default: { findByCpf: vi.fn() },
}));

import debtService from '../../../services/DebtService';
import debtRepository from '../../../repositories/DebtRepository';
import consultantRepository from '../../../repositories/ConsultantRepository';

const mockConsultant = {
  id: 'c1', codigo: 'C001', tipo: 3, grupo: 'G1', distrito: 'D1',
  cpf: '11144477735', userId: 'u1', createdAt: new Date(), updatedAt: new Date(),
};

const mockDebt = {
  id: 'd1', codigo: 'C001', nome: 'Maria Consultora', grupo: 'G1', distrito: 'D1',
  semana: 'S01/2026', valor: 150, diasAtraso: 5, dataVencimento: new Date('2026-01-01'),
  numeroNf: 'NF-0001', status: 'PENDENTE', createdAt: new Date(), updatedAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(debtRepository.findMany).mockResolvedValue({ data: [mockDebt as any], total: 1 });
});

describe('DebtService.list — hierarquia de visibilidade', () => {
  it('ADMIN: não aplica filtro hierárquico', async () => {
    await debtService.list({ role: 'ADMIN', cpf: '' } as any, {});
    const call = vi.mocked(debtRepository.findMany).mock.calls[0][0];
    expect(call.where).not.toHaveProperty('distrito');
    expect(call.where).not.toHaveProperty('grupo');
    expect(call.where).not.toHaveProperty('codigo');
    expect(consultantRepository.findByCpf).not.toHaveBeenCalled();
  });

  it('GERENTE: não aplica filtro hierárquico', async () => {
    await debtService.list({ role: 'GERENTE', cpf: '' } as any, {});
    const call = vi.mocked(debtRepository.findMany).mock.calls[0][0];
    expect(call.where).not.toHaveProperty('distrito');
    expect(call.where).not.toHaveProperty('grupo');
    expect(call.where).not.toHaveProperty('codigo');
  });

  it('EMPRESARIA: filtra por distrito do consultor', async () => {
    vi.mocked(consultantRepository.findByCpf).mockResolvedValueOnce(mockConsultant as any);
    await debtService.list({ role: 'EMPRESARIA', cpf: '11144477735' } as any, {});
    const call = vi.mocked(debtRepository.findMany).mock.calls[0][0];
    expect(call.where.distrito).toBe('D1');
  });

  it('LIDER: filtra por grupo do consultor', async () => {
    vi.mocked(consultantRepository.findByCpf).mockResolvedValueOnce(mockConsultant as any);
    await debtService.list({ role: 'LIDER', cpf: '11144477735' } as any, {});
    const call = vi.mocked(debtRepository.findMany).mock.calls[0][0];
    expect(call.where.grupo).toBe('G1');
  });

  it('CONSULTOR: filtra por codigo do consultor', async () => {
    vi.mocked(consultantRepository.findByCpf).mockResolvedValueOnce(mockConsultant as any);
    await debtService.list({ role: 'CONSULTOR', cpf: '11144477735' } as any, {});
    const call = vi.mocked(debtRepository.findMany).mock.calls[0][0];
    expect(call.where.codigo).toBe('C001');
  });

  it('CONSULTOR sem registro em consultants: lança 403', async () => {
    vi.mocked(consultantRepository.findByCpf).mockResolvedValueOnce(null);
    await expect(debtService.list({ role: 'CONSULTOR', cpf: '11144477735' } as any, {}))
      .rejects.toMatchObject({ statusCode: StatusCodes.FORBIDDEN });
  });

  it('EMPRESARIA sem registro em consultants: lança 403', async () => {
    vi.mocked(consultantRepository.findByCpf).mockResolvedValueOnce(null);
    await expect(debtService.list({ role: 'EMPRESARIA', cpf: '11144477735' } as any, {}))
      .rejects.toMatchObject({ statusCode: StatusCodes.FORBIDDEN });
  });
});

describe('DebtService.list — filtros da query', () => {
  beforeEach(() => {
    vi.mocked(debtRepository.findMany).mockResolvedValue({ data: [], total: 0 });
  });

  it('aplica filtro de status', async () => {
    await debtService.list({ role: 'ADMIN', cpf: '' } as any, { status: 'PAGO' });
    const call = vi.mocked(debtRepository.findMany).mock.calls[0][0];
    expect(call.where.status).toBe('PAGO');
  });

  it('aplica filtro de grupo', async () => {
    await debtService.list({ role: 'ADMIN', cpf: '' } as any, { grupo: 'G2' });
    const call = vi.mocked(debtRepository.findMany).mock.calls[0][0];
    expect(call.where.grupo).toBe('G2');
  });

  it('aplica filtro de distrito', async () => {
    await debtService.list({ role: 'ADMIN', cpf: '' } as any, { distrito: 'D3' });
    const call = vi.mocked(debtRepository.findMany).mock.calls[0][0];
    expect(call.where.distrito).toBe('D3');
  });

  it('aplica filtro de data de vencimento (início e fim)', async () => {
    await debtService.list({ role: 'ADMIN', cpf: '' } as any, {
      dataVencimentoInicio: '2026-01-01', dataVencimentoFim: '2026-03-31',
    });
    const call = vi.mocked(debtRepository.findMany).mock.calls[0][0];
    expect((call.where.dataVencimento as any).gte).toBeInstanceOf(Date);
    expect((call.where.dataVencimento as any).lte).toBeInstanceOf(Date);
  });

  it('aplica filtro de valor (min e max)', async () => {
    await debtService.list({ role: 'ADMIN', cpf: '' } as any, { valorMin: '100', valorMax: '500' });
    const call = vi.mocked(debtRepository.findMany).mock.calls[0][0];
    expect((call.where.valor as any).gte).toBe(100);
    expect((call.where.valor as any).lte).toBe(500);
  });
});

describe('DebtService.list — ordenação', () => {
  beforeEach(() => {
    vi.mocked(debtRepository.findMany).mockResolvedValue({ data: [], total: 0 });
  });

  it('ordenação padrão: dataVencimento desc', async () => {
    await debtService.list({ role: 'ADMIN', cpf: '' } as any, {});
    const call = vi.mocked(debtRepository.findMany).mock.calls[0][0];
    expect(call.orderBy).toEqual({ dataVencimento: 'desc' });
  });

  it('ordena por diasAtraso asc', async () => {
    await debtService.list({ role: 'ADMIN', cpf: '' } as any, { sortBy: 'diasAtraso', sortOrder: 'asc' });
    const call = vi.mocked(debtRepository.findMany).mock.calls[0][0];
    expect(call.orderBy).toEqual({ diasAtraso: 'asc' });
  });

  it('ordena por valor desc', async () => {
    await debtService.list({ role: 'ADMIN', cpf: '' } as any, { sortBy: 'valor', sortOrder: 'desc' });
    const call = vi.mocked(debtRepository.findMany).mock.calls[0][0];
    expect(call.orderBy).toEqual({ valor: 'desc' });
  });

  it('ignora campo inválido e usa padrão', async () => {
    await debtService.list({ role: 'ADMIN', cpf: '' } as any, { sortBy: 'campoInexistente' });
    const call = vi.mocked(debtRepository.findMany).mock.calls[0][0];
    expect(call.orderBy).toEqual({ dataVencimento: 'desc' });
  });
});

describe('DebtService.list — paginação', () => {
  it('aplica skip e take corretos na página 2', async () => {
    vi.mocked(debtRepository.findMany).mockResolvedValue({ data: [], total: 30 });
    await debtService.list({ role: 'ADMIN', cpf: '' } as any, { page: '2', limit: '10' });
    const call = vi.mocked(debtRepository.findMany).mock.calls[0][0];
    expect(call.skip).toBe(10);
    expect(call.take).toBe(10);
  });

  it('resposta inclui metadados de paginação corretos', async () => {
    vi.mocked(debtRepository.findMany).mockResolvedValue({ data: [mockDebt as any], total: 30 });
    const result = await debtService.list({ role: 'ADMIN', cpf: '' } as any, { page: '1', limit: '10' });
    expect(result.pagination.total).toBe(30);
    expect(result.pagination.totalPages).toBe(3);
    expect(result.pagination.hasNextPage).toBe(true);
  });
});

describe('DebtService.findById', () => {
  it('retorna o débito quando existe', async () => {
    vi.mocked(debtRepository.findById).mockResolvedValueOnce(mockDebt as any);
    const result = await debtService.findById('d1');
    expect(result.id).toBe('d1');
  });

  it('lança 404 quando débito não existe', async () => {
    vi.mocked(debtRepository.findById).mockResolvedValueOnce(null);
    await expect(debtService.findById('nao-existe'))
      .rejects.toMatchObject({ statusCode: StatusCodes.NOT_FOUND });
  });
});

describe('DebtService — hierarquia: filtros query string não devem sobrepor restrições de role', () => {
  it('EMPRESARIA não pode sobrepor filtro de distrito via query string', async () => {
    const consultantNorte = {
      id: 'c1', codigo: 'C001', tipo: 1, grupo: 'G1', distrito: 'Norte',
      cpf: '11144477735', userId: 'u1', createdAt: new Date(), updatedAt: new Date(),
    };
    vi.mocked(consultantRepository.findByCpf).mockResolvedValueOnce(consultantNorte as any);
    vi.mocked(debtRepository.findMany).mockResolvedValueOnce({ data: [], total: 0 });

    await debtService.list(
      { role: 'EMPRESARIA', cpf: '11144477735' },
      { distrito: 'Sul' }, // tenta sobrepor o distrito da EMPRESARIA
    );

    const call = vi.mocked(debtRepository.findMany).mock.calls[0][0];
    // O where deve usar 'Norte' (do consultor), NÃO 'Sul' (da query string)
    expect((call.where as any).distrito).toBe('Norte');
  });

  it('LIDER não pode sobrepor filtro de grupo via query string', async () => {
    const consultantLider = {
      id: 'c2', codigo: 'C002', tipo: 2, grupo: 'GrupoA', distrito: 'D1',
      cpf: '22233344405', userId: 'u2', createdAt: new Date(), updatedAt: new Date(),
    };
    vi.mocked(consultantRepository.findByCpf).mockResolvedValueOnce(consultantLider as any);
    vi.mocked(debtRepository.findMany).mockResolvedValueOnce({ data: [], total: 0 });

    await debtService.list(
      { role: 'LIDER', cpf: '22233344405' },
      { grupo: 'GrupoInimigo' }, // tenta sobrepor o grupo do LIDER
    );

    const call = vi.mocked(debtRepository.findMany).mock.calls[0][0];
    // O where deve usar 'GrupoA' (do consultor), NÃO 'GrupoInimigo' (da query string)
    expect((call.where as any).grupo).toBe('GrupoA');
  });

  it('ADMIN pode filtrar por grupo via query string', async () => {
    vi.mocked(debtRepository.findMany).mockResolvedValueOnce({ data: [], total: 0 });

    await debtService.list(
      { role: 'ADMIN', cpf: '' },
      { grupo: 'GrupoEspecifico' },
    );

    const call = vi.mocked(debtRepository.findMany).mock.calls[0][0];
    expect((call.where as any).grupo).toBe('GrupoEspecifico');
  });

  it('ADMIN pode filtrar por distrito via query string', async () => {
    vi.mocked(debtRepository.findMany).mockResolvedValueOnce({ data: [], total: 0 });

    await debtService.list(
      { role: 'ADMIN', cpf: '' },
      { distrito: 'Sul' },
    );

    const call = vi.mocked(debtRepository.findMany).mock.calls[0][0];
    expect((call.where as any).distrito).toBe('Sul');
  });

  it('CONSULTOR não pode filtrar por grupo via query string', async () => {
    const consultantConsultor = {
      id: 'c3', codigo: 'COD123', tipo: 3, grupo: 'GrupoC', distrito: 'D3',
      cpf: '33344455507', userId: 'u3', createdAt: new Date(), updatedAt: new Date(),
    };
    vi.mocked(consultantRepository.findByCpf).mockResolvedValueOnce(consultantConsultor as any);
    vi.mocked(debtRepository.findMany).mockResolvedValueOnce({ data: [], total: 0 });

    await debtService.list(
      { role: 'CONSULTOR', cpf: '33344455507' },
      { grupo: 'GrupoOutro' },
    );

    const call = vi.mocked(debtRepository.findMany).mock.calls[0][0];
    // CONSULTOR filtra por codigo, não por grupo
    expect((call.where as any).codigo).toBe('COD123');
    // grupo da query não deve ser aplicado
    expect((call.where as any).grupo).toBeUndefined();
  });
});
