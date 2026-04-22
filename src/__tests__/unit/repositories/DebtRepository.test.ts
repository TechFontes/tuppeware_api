import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../config/database', () => ({
  default: {
    debt: {
      updateMany: vi.fn(),
    },
  },
}));

import debtRepository from '../../../repositories/DebtRepository';
import prisma from '../../../config/database';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('DebtRepository.updateDebtPaidAmount', () => {
  it('atualiza paidAmount quando valor atual bate (lock otimista)', async () => {
    vi.mocked(prisma.debt.updateMany).mockResolvedValue({ count: 1 } as any);

    const result = await debtRepository.updateDebtPaidAmount(
      'debt-1',
      '40.00',
      '80.00',
      'PENDENTE',
    );

    expect(result).toBe(true);
    expect(prisma.debt.updateMany).toHaveBeenCalledWith({
      where: { id: 'debt-1', paidAmount: '40.00' },
      data: { paidAmount: '80.00', status: 'PENDENTE' },
    });
  });

  it('retorna false quando update afeta 0 linhas (conflito)', async () => {
    vi.mocked(prisma.debt.updateMany).mockResolvedValue({ count: 0 } as any);

    const result = await debtRepository.updateDebtPaidAmount('debt-1', '40.00', '80.00', 'PENDENTE');

    expect(result).toBe(false);
  });

  it('aceita newStatus PAGO quando dívida foi quitada', async () => {
    vi.mocked(prisma.debt.updateMany).mockResolvedValue({ count: 1 } as any);

    await debtRepository.updateDebtPaidAmount('debt-1', '40.00', '100.00', 'PAGO');

    expect(prisma.debt.updateMany).toHaveBeenCalledWith({
      where: { id: 'debt-1', paidAmount: '40.00' },
      data: { paidAmount: '100.00', status: 'PAGO' },
    });
  });
});
