import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../config/database', () => ({
  default: {
    savedCard: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

import savedCardRepository from '../../../repositories/SavedCardRepository';
import prisma from '../../../config/database';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SavedCardRepository.findByTokenizationId', () => {
  it('busca via where.tokenizationId', async () => {
    vi.mocked(prisma.savedCard.findUnique).mockResolvedValueOnce({ id: 'c1' } as any);

    const result = await savedCardRepository.findByTokenizationId('tok-uuid');

    expect(prisma.savedCard.findUnique).toHaveBeenCalledWith({ where: { tokenizationId: 'tok-uuid' } });
    expect(result?.id).toBe('c1');
  });

  it('retorna null quando não encontra', async () => {
    vi.mocked(prisma.savedCard.findUnique).mockResolvedValueOnce(null);

    const result = await savedCardRepository.findByTokenizationId('nope');

    expect(result).toBeNull();
  });
});

describe('SavedCardRepository.updateStatus', () => {
  it('atualiza status e campos do GET de tokenization', async () => {
    vi.mocked(prisma.savedCard.update).mockResolvedValueOnce({ id: 'c1', status: 'ACTIVE' } as any);

    const result = await savedCardRepository.updateStatus('c1', {
      status: 'ACTIVE',
      bin: '544828',
      cardBrand: 'MASTERCARD',
      lastFour: '0007',
      brandTid: 'btid-1',
      lastSyncedAt: new Date('2026-04-30T12:00:00Z'),
    });

    expect(prisma.savedCard.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: expect.objectContaining({ status: 'ACTIVE', bin: '544828' }),
    });
    expect(result.status).toBe('ACTIVE');
  });

  it('aceita atualização parcial (só status)', async () => {
    vi.mocked(prisma.savedCard.update).mockResolvedValueOnce({ id: 'c1', status: 'INACTIVE' } as any);

    await savedCardRepository.updateStatus('c1', { status: 'INACTIVE' });

    const callArg = vi.mocked(prisma.savedCard.update).mock.calls[0][0];
    expect(callArg.data.status).toBe('INACTIVE');
    expect(callArg.data.bin).toBeUndefined();
  });
});

describe('SavedCardRepository.findActiveForUser', () => {
  it('filtra por userId e id (sem importar o status — service decide)', async () => {
    vi.mocked(prisma.savedCard.findFirst).mockResolvedValueOnce({ id: 'c1' } as any);

    const result = await savedCardRepository.findActiveForUser('u1', 'c1');

    expect(prisma.savedCard.findFirst).toHaveBeenCalledWith({
      where: { id: 'c1', userId: 'u1' },
    });
    expect(result?.id).toBe('c1');
  });

  it('retorna null quando cartão não pertence ao user', async () => {
    vi.mocked(prisma.savedCard.findFirst).mockResolvedValueOnce(null);

    const result = await savedCardRepository.findActiveForUser('u1', 'c1');

    expect(result).toBeNull();
  });
});
