import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StatusCodes } from 'http-status-codes';

vi.mock('../../../repositories/SavedCardRepository', () => ({
  default: {
    create: vi.fn(),
    findById: vi.fn(),
    findByUserId: vi.fn(),
    findByTokenizationId: vi.fn(),
    findActiveForUser: vi.fn(),
    updateStatus: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../../../services/ERedeService', () => ({
  default: {
    tokenizeCardCofre: vi.fn(),
    queryTokenization: vi.fn(),
    manageTokenization: vi.fn(),
  },
}));

import savedCardService from '../../../services/SavedCardService';
import savedCardRepository from '../../../repositories/SavedCardRepository';
import eRedeService from '../../../services/ERedeService';

const makeCard = (overrides: Record<string, unknown> = {}) => ({
  id: 'card-1',
  userId: 'user-1',
  tokenizationId: 'tok-uuid',
  status: 'PENDING' as const,
  email: 'user@test.com',
  bin: null,
  cardBrand: null,
  lastFour: '0007',
  holderName: 'TESTE',
  brandTid: null,
  lastSyncedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SavedCardService.tokenizeAndSave', () => {
  it('tokeniza, persiste com PENDING e faz sync imediato (best-effort)', async () => {
    vi.mocked(eRedeService.tokenizeCardCofre).mockResolvedValueOnce({ tokenizationId: 'tok-uuid' });
    vi.mocked(savedCardRepository.create).mockResolvedValueOnce(makeCard() as any);
    vi.mocked(eRedeService.queryTokenization).mockResolvedValueOnce({
      tokenizationId: 'tok-uuid',
      status: 'ACTIVE',
      bin: '544828',
      last4: '0007',
      brand: 'MASTERCARD',
      brandTid: 'btid-1',
      raw: {},
    });
    vi.mocked(savedCardRepository.updateStatus).mockResolvedValueOnce(
      makeCard({ status: 'ACTIVE', bin: '544828', cardBrand: 'MASTERCARD' }) as any,
    );

    const result = await savedCardService.tokenizeAndSave({
      userId: 'user-1',
      email: 'user@test.com',
      cardNumber: '5448280000000007',
      expMonth: '12',
      expYear: '2030',
      holderName: 'TESTE',
    });

    expect(result.status).toBe('ACTIVE');
    expect(result.bin).toBe('544828');
    expect((result as any).tokenizationId).toBeUndefined(); // DTO não expõe
    expect(savedCardRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      tokenizationId: 'tok-uuid',
      email: 'user@test.com',
      lastFour: '0007',
      holderName: 'TESTE',
      status: 'PENDING',
    }));
  });

  it('quando sync imediato falha, retorna DTO com status PENDING (não propaga erro)', async () => {
    vi.mocked(eRedeService.tokenizeCardCofre).mockResolvedValueOnce({ tokenizationId: 'tok-uuid' });
    vi.mocked(savedCardRepository.create).mockResolvedValueOnce(makeCard() as any);
    vi.mocked(eRedeService.queryTokenization).mockRejectedValueOnce(new Error('5xx eRede'));

    const result = await savedCardService.tokenizeAndSave({
      userId: 'user-1',
      email: 'user@test.com',
      cardNumber: '5448280000000007',
      expMonth: '12',
      expYear: '2030',
      holderName: 'TESTE',
    });

    expect(result.status).toBe('PENDING');
  });

  it('propaga erro do tokenizeCardCofre', async () => {
    vi.mocked(eRedeService.tokenizeCardCofre).mockRejectedValueOnce(
      Object.assign(new Error('Cartão inválido'), { statusCode: 400 }),
    );

    await expect(
      savedCardService.tokenizeAndSave({
        userId: 'user-1',
        email: 'user@test.com',
        cardNumber: '0000',
        expMonth: '01',
        expYear: '2020',
        holderName: 'X',
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('SavedCardService.listByUser', () => {
  it('retorna view pública (sem tokenizationId)', async () => {
    vi.mocked(savedCardRepository.findByUserId).mockResolvedValueOnce([
      makeCard(),
      makeCard({ id: 'card-2', tokenizationId: 'tok-2' }),
    ] as any);

    const result = await savedCardService.listByUser('user-1');

    expect(result).toHaveLength(2);
    result.forEach((c) => {
      expect((c as any).tokenizationId).toBeUndefined();
      expect(c.id).toBeDefined();
      expect(c.lastFour).toBeDefined();
    });
  });
});

describe('SavedCardService.deleteCard', () => {
  it('chama manageTokenization (delete) e repository.delete', async () => {
    vi.mocked(savedCardRepository.findById).mockResolvedValueOnce(makeCard() as any);
    vi.mocked(eRedeService.manageTokenization).mockResolvedValueOnce({ returnCode: '00', returnMessage: 'OK' });
    vi.mocked(savedCardRepository.delete).mockResolvedValueOnce(makeCard() as any);

    await savedCardService.deleteCard('user-1', 'card-1');

    expect(eRedeService.manageTokenization).toHaveBeenCalledWith('tok-uuid', 'delete', 1);
    expect(savedCardRepository.delete).toHaveBeenCalledWith('card-1');
  });

  it('quando manageTokenization falha, ainda assim deleta localmente', async () => {
    vi.mocked(savedCardRepository.findById).mockResolvedValueOnce(makeCard() as any);
    vi.mocked(eRedeService.manageTokenization).mockRejectedValueOnce(new Error('eRede 5xx'));
    vi.mocked(savedCardRepository.delete).mockResolvedValueOnce(makeCard() as any);

    await savedCardService.deleteCard('user-1', 'card-1');

    expect(savedCardRepository.delete).toHaveBeenCalledWith('card-1');
  });

  it('lança 404 quando cartão não existe', async () => {
    vi.mocked(savedCardRepository.findById).mockResolvedValueOnce(null);

    await expect(savedCardService.deleteCard('user-1', 'nope'))
      .rejects.toMatchObject({ statusCode: StatusCodes.NOT_FOUND });
  });

  it('lança 403 quando cartão não pertence ao user', async () => {
    vi.mocked(savedCardRepository.findById).mockResolvedValueOnce(makeCard({ userId: 'other' }) as any);

    await expect(savedCardService.deleteCard('user-1', 'card-1'))
      .rejects.toMatchObject({ statusCode: StatusCodes.FORBIDDEN });
  });
});
