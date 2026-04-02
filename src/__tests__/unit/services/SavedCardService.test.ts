import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StatusCodes } from 'http-status-codes';

vi.mock('../../../repositories/SavedCardRepository', () => ({
  default: {
    findByToken: vi.fn(),
    findByUserId: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../../../services/ERedeService', () => ({
  default: {
    tokenizeCard: vi.fn(),
  },
}));

import savedCardService from '../../../services/SavedCardService';
import savedCardRepository from '../../../repositories/SavedCardRepository';
import eRedeService from '../../../services/ERedeService';

const makeCard = (overrides: Record<string, unknown> = {}) => ({
  id: 'card-1',
  userId: 'user-1',
  token: 'tok_abc123',
  cardBrand: 'VISA',
  lastFour: '1111',
  holderName: 'Test User',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SavedCardService.tokenizeAndSave', () => {
  it('tokeniza e salva novo cartão quando token não existe', async () => {
    vi.mocked(eRedeService.tokenizeCard).mockResolvedValueOnce({
      token: 'tok_new', brand: 'VISA', lastFour: '4242',
    });
    vi.mocked(savedCardRepository.findByToken).mockResolvedValueOnce(null);
    vi.mocked(savedCardRepository.create).mockResolvedValueOnce(makeCard({ token: 'tok_new' }) as any);

    await savedCardService.tokenizeAndSave({
      userId: 'user-1', cardNumber: '4242424242424242',
      expMonth: '12', expYear: '2028', holderName: 'Test User',
    });

    expect(eRedeService.tokenizeCard).toHaveBeenCalledWith({
      number: '4242424242424242', expMonth: '12', expYear: '2028', holderName: 'Test User',
    });
    expect(savedCardRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', token: 'tok_new', lastFour: '4242' }),
    );
  });

  it('retorna cartão existente quando token já está salvo (sem duplicar)', async () => {
    vi.mocked(eRedeService.tokenizeCard).mockResolvedValueOnce({
      token: 'tok_existing', brand: 'VISA', lastFour: '1111',
    });
    vi.mocked(savedCardRepository.findByToken).mockResolvedValueOnce(makeCard({ token: 'tok_existing' }) as any);

    const result = await savedCardService.tokenizeAndSave({
      userId: 'user-1', cardNumber: '4111111111111111',
      expMonth: '12', expYear: '2028', holderName: 'Test User',
    });

    expect(savedCardRepository.create).not.toHaveBeenCalled();
    expect((result as any).token).toBe('tok_existing');
  });

  it('propaga erro quando tokenização falha', async () => {
    vi.mocked(eRedeService.tokenizeCard).mockRejectedValueOnce(
      new Error('Timeout ao tokenizar'),
    );

    await expect(savedCardService.tokenizeAndSave({
      userId: 'user-1', cardNumber: '4242424242424242',
      expMonth: '12', expYear: '2028', holderName: 'Test User',
    })).rejects.toThrow('Timeout ao tokenizar');
  });
});

describe('SavedCardService.listByUser', () => {
  it('retorna cartões do usuário', async () => {
    vi.mocked(savedCardRepository.findByUserId).mockResolvedValueOnce([makeCard()] as any);
    const result = await savedCardService.listByUser('user-1');
    expect(savedCardRepository.findByUserId).toHaveBeenCalledWith('user-1');
    expect(result).toHaveLength(1);
  });

  it('retorna lista vazia quando usuário não tem cartões', async () => {
    vi.mocked(savedCardRepository.findByUserId).mockResolvedValueOnce([]);
    const result = await savedCardService.listByUser('user-1');
    expect(result).toHaveLength(0);
  });
});

describe('SavedCardService.deleteCard', () => {
  it('lança 404 quando cartão não existe', async () => {
    vi.mocked(savedCardRepository.findById).mockResolvedValueOnce(null);
    await expect(savedCardService.deleteCard('user-1', 'card-nao-existe'))
      .rejects.toMatchObject({ statusCode: StatusCodes.NOT_FOUND });
  });

  it('lança 403 quando cartão pertence a outro usuário', async () => {
    vi.mocked(savedCardRepository.findById).mockResolvedValueOnce(
      makeCard({ userId: 'outro-usuario' }) as any,
    );
    await expect(savedCardService.deleteCard('user-1', 'card-1'))
      .rejects.toMatchObject({ statusCode: StatusCodes.FORBIDDEN });
  });

  it('deleta o cartão quando usuário é o dono', async () => {
    vi.mocked(savedCardRepository.findById).mockResolvedValueOnce(makeCard() as any);
    vi.mocked(savedCardRepository.delete).mockResolvedValueOnce(undefined as any);

    await savedCardService.deleteCard('user-1', 'card-1');

    expect(savedCardRepository.delete).toHaveBeenCalledWith('card-1');
  });
});
