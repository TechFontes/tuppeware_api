import { StatusCodes } from 'http-status-codes';
import AppError from '../utils/AppError';
import savedCardRepository from '../repositories/SavedCardRepository';
import eRedeService from './ERedeService';
import type { SavedCard, SavedCardStatus } from '../../generated/prisma/client';

interface TokenizeAndSaveParams {
  userId: string;
  email: string;
  cardNumber: string;
  expMonth: string;
  expYear: string;
  holderName: string;
  securityCode?: string;
}

interface SavedCardPublicView {
  id: string;
  status: SavedCardStatus;
  cardBrand: string | null;
  lastFour: string;
  holderName: string;
  bin: string | null;
  createdAt: Date;
}

function toPublicView(card: SavedCard): SavedCardPublicView {
  return {
    id: card.id,
    status: card.status,
    cardBrand: card.cardBrand,
    lastFour: card.lastFour,
    holderName: card.holderName,
    bin: card.bin,
    createdAt: card.createdAt,
  };
}

class SavedCardService {
  async tokenizeAndSave(params: TokenizeAndSaveParams): Promise<SavedCardPublicView> {
    const { tokenizationId } = await eRedeService.tokenizeCardCofre({
      email: params.email,
      cardNumber: params.cardNumber,
      expirationMonth: params.expMonth,
      expirationYear: params.expYear,
      cardholderName: params.holderName,
      securityCode: params.securityCode,
    });

    const lastFour = params.cardNumber.slice(-4);
    const created = await savedCardRepository.create({
      userId: params.userId,
      tokenizationId,
      status: 'PENDING',
      email: params.email,
      lastFour,
      holderName: params.holderName,
    });

    let final: SavedCard = created;
    try {
      const remote = await eRedeService.queryTokenization(tokenizationId);
      final = await savedCardRepository.updateStatus(created.id, {
        status: remote.status,
        bin: remote.bin ?? null,
        cardBrand: remote.brand ?? null,
        lastFour: remote.last4 ?? lastFour,
        brandTid: remote.brandTid ?? null,
        lastSyncedAt: new Date(),
      });
    } catch (_err) {
      // Sync best-effort: cartão fica PENDING e será promovido por webhook ou assertActiveForCharge.
    }

    return toPublicView(final);
  }

  async listByUser(userId: string): Promise<SavedCardPublicView[]> {
    const cards = await savedCardRepository.findByUserId(userId);
    return cards.map(toPublicView);
  }

  async deleteCard(userId: string, cardId: string): Promise<void> {
    const card = await savedCardRepository.findById(cardId);

    if (!card) {
      throw new AppError('Cartão não encontrado.', StatusCodes.NOT_FOUND);
    }

    if (card.userId !== userId) {
      throw new AppError('Acesso negado.', StatusCodes.FORBIDDEN);
    }

    try {
      await eRedeService.manageTokenization(card.tokenizationId, 'delete', 1);
    } catch (err) {
      console.error('[SavedCardService] manageTokenization falhou (ignorando):', err);
    }

    await savedCardRepository.delete(cardId);
  }
}

export type { SavedCardPublicView };
export default new SavedCardService();
