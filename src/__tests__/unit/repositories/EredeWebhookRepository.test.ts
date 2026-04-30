import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../config/database', () => ({
  default: {
    eredeWebhookEvent: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import eredeWebhookRepository from '../../../repositories/EredeWebhookRepository';
import prisma from '../../../config/database';

beforeEach(() => { vi.clearAllMocks(); });

describe('EredeWebhookRepository.findByExternalId', () => {
  it('busca por externalId UNIQUE', async () => {
    vi.mocked(prisma.eredeWebhookEvent.findUnique).mockResolvedValueOnce({ id: 'e1' } as any);
    const result = await eredeWebhookRepository.findByExternalId('req-123');
    expect(prisma.eredeWebhookEvent.findUnique).toHaveBeenCalledWith({ where: { externalId: 'req-123' } });
    expect(result?.id).toBe('e1');
  });
});

describe('EredeWebhookRepository.create', () => {
  it('persiste evento bruto com processed=false', async () => {
    vi.mocked(prisma.eredeWebhookEvent.create).mockResolvedValueOnce({ id: 'e1' } as any);

    await eredeWebhookRepository.create({
      externalId: 'req-123',
      eventType: 'TOKENIZATION',
      events: ['PV.TOKENIZACAO-BANDEIRA'],
      payload: { tokenizationId: 'tok-uuid' },
    });

    expect(prisma.eredeWebhookEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        externalId: 'req-123',
        eventType: 'TOKENIZATION',
        processed: false,
      }),
    });
  });
});

describe('EredeWebhookRepository.markProcessed', () => {
  it('atualiza processed=true e processedAt', async () => {
    vi.mocked(prisma.eredeWebhookEvent.update).mockResolvedValueOnce({} as any);

    await eredeWebhookRepository.markProcessed('e1');

    expect(prisma.eredeWebhookEvent.update).toHaveBeenCalledWith({
      where: { id: 'e1' },
      data: expect.objectContaining({ processed: true, processedAt: expect.any(Date) }),
    });
  });
});

describe('EredeWebhookRepository.markFailed', () => {
  it('grava errorMessage e mantém processed=false', async () => {
    vi.mocked(prisma.eredeWebhookEvent.update).mockResolvedValueOnce({} as any);

    await eredeWebhookRepository.markFailed('e1', 'Timeout no GET tokenization');

    expect(prisma.eredeWebhookEvent.update).toHaveBeenCalledWith({
      where: { id: 'e1' },
      data: { processed: false, errorMessage: 'Timeout no GET tokenization' },
    });
  });
});
