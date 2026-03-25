import { StatusCodes } from 'http-status-codes';
import AppError from '../utils/AppError';
import savedCardRepository from '../repositories/SavedCardRepository';
import eRedeService from './ERedeService';

interface TokenizeCardParams {
  userId: string;
  cardNumber: string;
  expMonth: string;
  expYear: string;
  holderName: string;
}

class SavedCardService {
  /**
   * Tokeniza um cartão via eRede e salva o token para uso futuro.
   * Retorna silenciosamente se o token já existir para este usuário.
   */
  async tokenizeAndSave(params: TokenizeCardParams) {
    const { userId, cardNumber, expMonth, expYear, holderName } = params;

    const tokenData = await eRedeService.tokenizeCard({
      number: cardNumber,
      expMonth,
      expYear,
      holderName,
    });

    // Evita duplicidade: checa se token já existe
    const existing = await savedCardRepository.findByToken(tokenData.token);

    if (existing) {
      return existing;
    }

    return await savedCardRepository.create({
      userId,
      token: tokenData.token,
      cardBrand: tokenData.brand || null,
      lastFour: tokenData.lastFour,
      holderName,
    });
  }

  async listByUser(userId: string) {
    return await savedCardRepository.findByUserId(userId);
  }

  async deleteCard(userId: string, cardId: string) {
    const card = await savedCardRepository.findById(cardId);

    if (!card) {
      throw new AppError('Cartão não encontrado.', StatusCodes.NOT_FOUND);
    }

    if (card.userId !== userId) {
      throw new AppError('Acesso negado.', StatusCodes.FORBIDDEN);
    }

    await savedCardRepository.delete(cardId);
  }
}

export default new SavedCardService();
