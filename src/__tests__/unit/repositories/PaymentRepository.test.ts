import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../config/database', () => ({
  default: {
    payment: { update: vi.fn(), findFirst: vi.fn() },
  },
}));

import paymentRepository from '../../../repositories/PaymentRepository';
import prisma from '../../../config/database';

beforeEach(() => { vi.clearAllMocks(); });

describe('PaymentRepository.updateByTid', () => {
  it('atualiza pelo gatewayTransactionId', async () => {
    vi.mocked(prisma.payment.findFirst).mockResolvedValueOnce({ id: 'p1' } as any);
    vi.mocked(prisma.payment.update).mockResolvedValueOnce({ id: 'p1', status: 'PAGO' } as any);

    const result = await paymentRepository.updateByTid('tid-123', { status: 'PAGO' });

    expect(prisma.payment.findFirst).toHaveBeenCalledWith({
      where: { gatewayTransactionId: 'tid-123' },
      select: { id: true },
    });
    expect(prisma.payment.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { status: 'PAGO' },
    });
    expect(result?.status).toBe('PAGO');
  });

  it('retorna null quando payment não encontrado', async () => {
    vi.mocked(prisma.payment.findFirst).mockResolvedValueOnce(null);

    const result = await paymentRepository.updateByTid('tid-nope', { status: 'PAGO' });

    expect(result).toBeNull();
    expect(prisma.payment.update).not.toHaveBeenCalled();
  });
});
