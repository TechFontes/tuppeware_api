import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../repositories/DebtRepository', () => ({
  default: {
    findMany: vi.fn(),
    findById: vi.fn(),
    upsertByNf: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('../../../repositories/ConsultantRepository', () => ({
  default: { findByCpf: vi.fn() },
}));

import debtService from '../../../services/DebtService';
import debtRepository from '../../../repositories/DebtRepository';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('DebtService admin methods', () => {
  it('adminCreateDebt cria um débito com diasAtraso=0', async () => {
    vi.mocked(debtRepository.upsertByNf).mockResolvedValueOnce({ id: 'd1' } as any);

    await debtService.adminCreateDebt({
      codigo: 'C001', nome: 'Test', grupo: 'G1', distrito: 'D1',
      semana: 'S01', valor: 150, dataVencimento: new Date('2024-01-15'),
      numeroNf: 'NF001', status: 'PENDENTE',
    });

    expect(debtRepository.upsertByNf).toHaveBeenCalledWith(
      expect.objectContaining({ diasAtraso: 0, codigo: 'C001' }),
    );
  });

  it('adminUpdateDebtStatus atualiza o status do débito', async () => {
    vi.mocked(debtRepository.update).mockResolvedValueOnce({ id: 'd1', status: 'PAGO' } as any);

    await debtService.adminUpdateDebtStatus('d1', 'PAGO');

    expect(debtRepository.update).toHaveBeenCalledWith('d1', { status: 'PAGO' });
  });

  it('listByWeek filtra por semana quando fornecida', async () => {
    vi.mocked(debtRepository.findMany).mockResolvedValueOnce({ data: [], total: 0 });

    await debtService.listByWeek('S01');

    expect(debtRepository.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { semana: 'S01' } }),
    );
  });

  it('listByWeek retorna todos quando semana não fornecida', async () => {
    vi.mocked(debtRepository.findMany).mockResolvedValueOnce({ data: [], total: 0 });

    await debtService.listByWeek();

    expect(debtRepository.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    );
  });

  it('listPaidToday filtra por status PAGO e data de hoje', async () => {
    vi.mocked(debtRepository.findMany).mockResolvedValueOnce({ data: [], total: 0 });

    await debtService.listPaidToday();

    const call = vi.mocked(debtRepository.findMany).mock.calls[0][0];
    expect((call.where as any).status).toBe('PAGO');
    expect((call.where as any).updatedAt).toBeDefined();
    expect((call.where as any).updatedAt.gte).toBeInstanceOf(Date);
    expect((call.where as any).updatedAt.lt).toBeInstanceOf(Date);
  });
});
