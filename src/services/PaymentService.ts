import { StatusCodes } from 'http-status-codes';
import AppError from '../utils/AppError';
import { getPaginationParams, paginatedResponse } from '../utils/pagination';
import paymentRepository from '../repositories/PaymentRepository';
import debtRepository from '../repositories/DebtRepository';
import eRedeService from './ERedeService';
import webSocketService from './WebSocketService';
import savedCardService from './SavedCardService';
import savedCardRepository from '../repositories/SavedCardRepository';
import type { CreatePaymentDTO, ERedeCallbackPayload } from '../types';
import type { Prisma } from '../../generated/prisma/client';

const CREDIT_CARD_FEE_RATE = 0.05; // 5%

interface PaymentQuery {
  page?: string;
  limit?: string;
  status?: string;
  search?: string;
}

class PaymentService {
  /**
   * Cria um pagamento na eRede.
   */
  async create(userId: string, payload: CreatePaymentDTO) {
    const { debtIds, method, installments, billing, saveCard, savedCardId } = payload;
    let card = payload.card;

    // Busca os débitos selecionados
    const debts = await debtRepository.findByIds(debtIds);

    if (debts.length === 0) {
      throw new AppError('Nenhum débito válido encontrado.', StatusCodes.BAD_REQUEST);
    }

    if (debts.length !== debtIds.length) {
      throw new AppError('Alguns débitos não foram encontrados.', StatusCodes.BAD_REQUEST);
    }

    // Verifica se algum débito já está pago
    const paidDebts = debts.filter((d) => d.status === 'PAGO');

    if (paidDebts.length > 0) {
      throw new AppError('Alguns débitos selecionados já estão pagos.', StatusCodes.BAD_REQUEST);
    }

    // Calcula valores
    const subtotal = debts.reduce((sum, d) => sum + parseFloat(d.valor.toString()), 0);
    let fee = 0;
    let totalValue = subtotal;

    if (method === 'CARTAO_CREDITO') {
      fee = subtotal * CREDIT_CARD_FEE_RATE;
      totalValue = subtotal + fee;

      this._validateInstallments(subtotal, installments);

      if (!card || !billing) {
        throw new AppError(
          'Dados de cartão e billing são obrigatórios para pagamento com cartão.',
          StatusCodes.BAD_REQUEST,
        );
      }
    } else {
      if (installments && installments > 1) {
        throw new AppError('PIX não permite parcelamento.', StatusCodes.BAD_REQUEST);
      }

      if (!billing) {
        throw new AppError('Dados de billing são obrigatórios para pagamento via gateway.', StatusCodes.BAD_REQUEST);
      }
    }

    // Resolve cartão salvo se savedCardId fornecido
    let cardToken: string | undefined;
    if (method === 'CARTAO_CREDITO' && savedCardId) {
      const savedCard = await savedCardRepository.findById(savedCardId);
      if (!savedCard) {
        throw new AppError('Cartão salvo não encontrado.', StatusCodes.NOT_FOUND);
      }
      if (savedCard.userId !== userId) {
        throw new AppError('Acesso negado ao cartão salvo.', StatusCodes.FORBIDDEN);
      }
      if (!card?.cvv) {
        throw new AppError('CVV é obrigatório ao pagar com cartão salvo.', StatusCodes.BAD_REQUEST);
      }
      cardToken = savedCard.token;
      card = {
        number: '',
        expMonth: card?.expMonth || '',
        expYear: card?.expYear || '',
        cvv: card.cvv,
        holderName: savedCard.holderName,
      };
    }

    // Verifica limite de links ativos
    await this._checkActiveLinksLimit(userId);

    const referenceNum = this.generateReferenceNum(userId);
    // eRede exige valor em centavos (inteiro)
    const amountCents = Math.round(totalValue * 100);

    // Monta payload para a eRede
    const eredePayload = method === 'PIX'
      ? eRedeService.buildPixPayload(referenceNum, amountCents)
      : eRedeService.buildCreditPayload({
          reference: referenceNum,
          amountCents,
          installments: installments || 1,
          card: card!,
          billing: billing!,
          cardToken,
        });

    // Cria transação na eRede
    const gatewayResponse = await eRedeService.createTransaction(eredePayload);

    // Determina status inicial com base no returnCode antes de criar o registro
    const initialStatus = eRedeService.mapStatusToLocal(gatewayResponse.returnCode);

    // Cria o pagamento no banco com status já definido (evita update separado pós-criação)
    const payment = await paymentRepository.create({
      userId,
      method,
      installments: method === 'CARTAO_CREDITO' ? (installments || 1) : 1,
      subtotal,
      fee,
      totalValue,
      status: initialStatus,
      gatewayProvider: 'EREDE',
      referenceNum,
      gatewayTransactionId: gatewayResponse.tid || null,
      gatewayOrderId: gatewayResponse.nsu || null,
      gatewayStatusCode: gatewayResponse.returnCode,
      gatewayStatusMessage: gatewayResponse.returnMessage,
      processorReference: gatewayResponse.authorizationCode || null,
      // PIX: link da imagem do QR code; cartão: null (aprovação síncrona)
      paymentLink: gatewayResponse.pix?.link || null,
      // String EMV para copiar-colar (PIX)
      qrCode: gatewayResponse.pix?.qrCode || null,
      paymentDebts: {
        create: debtIds.map((debtId) => ({ debtId })),
      },
    });

    // Atualiza débitos se pagamento aprovado imediatamente
    if (initialStatus === 'PAGO') {
      await debtRepository.updateMany({ id: { in: debtIds } }, { status: 'PAGO' });
    }

    // Tokeniza e salva o cartão se solicitado e pagamento aprovado
    if (method === 'CARTAO_CREDITO' && saveCard && card && gatewayResponse.returnCode === '00') {
      try {
        await savedCardService.tokenizeAndSave({
          userId,
          cardNumber: card.number,
          expMonth: card.expMonth,
          expYear: card.expYear,
          holderName: card.holderName,
        });
      } catch (_) {
        // Falha na tokenização não deve interromper o fluxo de pagamento
      }
    }

    // Emite evento via WebSocket
    webSocketService.emitToUser(userId, 'payment:created', {
      paymentId: payment.id,
      totalValue,
      method,
      gatewayResponseCode: gatewayResponse.returnCode,
      checkoutUrl: gatewayResponse.pix?.link || null,
      qrCode: gatewayResponse.pix?.qrCode || null,
    });

    return {
      ...payment,
      checkoutUrl: gatewayResponse.pix?.link || null,
      qrCode: gatewayResponse.pix?.qrCode || null,
      gatewayResponseCode: gatewayResponse.returnCode,
      gatewayResponseMessage: gatewayResponse.returnMessage,
    };
  }

  /**
   * Lista o histórico de pagamentos do usuário.
   */
  async getHistory(userId: string, query: PaymentQuery) {
    const { page, limit, skip } = getPaginationParams(query as Record<string, string | undefined>);
    const where: Record<string, unknown> = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.search) {
      where.OR = [
        { paymentDebts: { some: { debt: { numeroNf: { contains: query.search } } } } },
      ];
    }

    const { data, total } = await paymentRepository.findByUserId(userId, {
      where,
      skip,
      take: limit,
    });

    return paginatedResponse(data, total, page, limit);
  }

  /**
   * Busca detalhes de um pagamento.
   */
  async getById(userId: string, paymentId: string) {
    const payment = await paymentRepository.findById(paymentId);

    if (!payment) {
      throw new AppError('Pagamento não encontrado.', StatusCodes.NOT_FOUND);
    }

    if (payment.userId !== userId) {
      throw new AppError('Acesso negado a este pagamento.', StatusCodes.FORBIDDEN);
    }

    return payment;
  }

  /**
   * Processa callback assíncrono da eRede.
   */
  async processGatewayCallback(callbackPayload: ERedeCallbackPayload) {
    if (!eRedeService.validateCallbackSignature(callbackPayload)) {
      throw new AppError('Payload de callback inválido.', StatusCodes.BAD_REQUEST);
    }

    const { tid, reference, returnCode, status: eredeStatus } = callbackPayload;

    if (!tid && !reference) {
      throw new AppError('Callback sem identificador de transação.', StatusCodes.BAD_REQUEST);
    }

    const payment = tid
      ? await paymentRepository.findByGatewayTransactionId(tid)
      : await paymentRepository.findByReferenceNum(reference);

    if (!payment) {
      throw new AppError('Pagamento não encontrado para callback.', StatusCodes.NOT_FOUND);
    }

    const localStatus = this.mapGatewayStatusToLocal(returnCode, eredeStatus);

    // Idempotente: sem mudança se já está no mesmo estado
    if (payment.gatewayStatusCode === returnCode && payment.status === localStatus) {
      return payment;
    }

    const updated = await paymentRepository.update(payment.id, {
      status: localStatus,
      gatewayStatusCode: returnCode,
      gatewayStatusMessage: String(eredeStatus ?? ''),
      gatewayTransactionId: tid || payment.gatewayTransactionId,
      callbackPayload: callbackPayload as unknown as Prisma.InputJsonValue,
    });

    if (localStatus === 'PAGO') {
      const debtIds = updated.paymentDebts.map((pd: { debtId: string }) => pd.debtId);
      await debtRepository.updateMany({ id: { in: debtIds } }, { status: 'PAGO' });
    }

    if (localStatus === 'CANCELADO') {
      const debtIds = updated.paymentDebts.map((pd: { debtId: string }) => pd.debtId);
      await debtRepository.updateMany({ id: { in: debtIds } }, { status: 'PENDENTE' });
    }

    webSocketService.emitToUser(updated.userId, 'payment:updated', {
      paymentId: updated.id,
      status: updated.status,
      gatewayStatusCode: returnCode,
    });

    return updated;
  }

  /**
   * Reativa um link de pagamento pendente.
   * - Se foi criado hoje e ainda tem paymentLink → retorna o existente (PIX)
   * - Se está expirado → cria nova transação na eRede
   */
  async reopenPayment(userId: string, paymentId: string) {
    const payment = await paymentRepository.findById(paymentId);

    if (!payment) {
      throw new AppError('Pagamento não encontrado.', StatusCodes.NOT_FOUND);
    }

    if (payment.userId !== userId) {
      throw new AppError('Acesso negado a este pagamento.', StatusCodes.FORBIDDEN);
    }

    if (payment.status !== 'PENDENTE') {
      throw new AppError('Só é possível reabrir pagamentos pendentes.', StatusCodes.BAD_REQUEST);
    }

    // Verifica se foi criado hoje
    const today = new Date();
    const createdAt = new Date(payment.createdAt);
    const isToday = createdAt.toDateString() === today.toDateString();

    // Para PIX: se foi criado hoje e tem link, retorna o existente
    if (isToday && payment.paymentLink && payment.method === 'PIX') {
      return {
        ...payment,
        checkoutUrl: payment.paymentLink,
        qrCode: payment.qrCode,
        reopened: false,
      };
    }

    // Para cartão ou PIX expirado: cria nova transação PIX (sem dados de cartão disponíveis)
    // Para cartão expirado, o cliente precisa pagar novamente com cartão via nova tentativa
    if (payment.method === 'CARTAO_CREDITO' && !isToday) {
      throw new AppError(
        'Pagamentos com cartão expirados precisam ser refeitos com uma nova transação.',
        StatusCodes.BAD_REQUEST,
      );
    }

    // Gera novo referenceNum para nova transação PIX
    const newReferenceNum = this.generateReferenceNum(userId);
    const amountCents = Math.round(parseFloat(payment.totalValue.toString()) * 100);
    const pixPayload = eRedeService.buildPixPayload(newReferenceNum, amountCents);
    const gatewayResponse = await eRedeService.createTransaction(pixPayload);

    const updated = await paymentRepository.update(payment.id, {
      referenceNum: newReferenceNum,
      gatewayTransactionId: gatewayResponse.tid || null,
      gatewayStatusCode: gatewayResponse.returnCode,
      gatewayStatusMessage: gatewayResponse.returnMessage,
      paymentLink: gatewayResponse.pix?.link || null,
      qrCode: gatewayResponse.pix?.qrCode || null,
    });

    return {
      ...updated,
      checkoutUrl: gatewayResponse.pix?.link || null,
      qrCode: gatewayResponse.pix?.qrCode || null,
      reopened: true,
    };
  }

  /**
   * Lista documentos pagos com filtros de data (admin).
   */
  async listPaidDocuments(params: {
    dataInicio?: string;
    dataFim?: string;
    page: number;
    limit: number;
    skip: number;
  }) {
    const where: Record<string, unknown> = { status: 'PAGO' };

    if (params.dataInicio || params.dataFim) {
      where.createdAt = {};
      if (params.dataInicio) (where.createdAt as Record<string, Date>).gte = new Date(params.dataInicio);
      if (params.dataFim) (where.createdAt as Record<string, Date>).lte = new Date(params.dataFim);
    }

    return paymentRepository.findMany({
      where: where as Parameters<typeof paymentRepository.findMany>[0]['where'],
      skip: params.skip,
      take: params.limit,
    });
  }

  /**
   * Atualiza o status de um pagamento (usado por admin).
   */
  async updateStatus(paymentId: string, status: string) {
    const payment = await paymentRepository.update(paymentId, { status: status as 'PENDENTE' | 'PAGO' | 'CANCELADO' });

    if (status === 'PAGO') {
      const debtIds = payment.paymentDebts.map((pd: { debtId: string }) => pd.debtId);
      await debtRepository.updateMany({ id: { in: debtIds } }, { status: 'PAGO' });
    }

    if (status === 'CANCELADO') {
      const debtIds = payment.paymentDebts.map((pd: { debtId: string }) => pd.debtId);
      await debtRepository.updateMany({ id: { in: debtIds } }, { status: 'PENDENTE' });
    }

    webSocketService.emitToUser(payment.userId, 'payment:updated', {
      paymentId: payment.id,
      status,
    });

    return payment;
  }

  /**
   * Valida regras de parcelamento para cartão de crédito.
   * - Abaixo de R$ 300: apenas à vista
   * - R$ 300 a R$ 499,99: até 2 parcelas
   * - A partir de R$ 500: até 3 parcelas
   */
  private _validateInstallments(totalValue: number, installments?: number): void {
    if (!installments || installments < 1) {
      throw new AppError('Número de parcelas inválido.', StatusCodes.BAD_REQUEST);
    }

    if (totalValue < 300 && installments > 1) {
      throw new AppError(
        'Valores abaixo de R$ 300,00 permitem apenas pagamento à vista.',
        StatusCodes.BAD_REQUEST,
      );
    }

    if (totalValue >= 300 && totalValue < 500 && installments > 2) {
      throw new AppError(
        'Valores entre R$ 300,00 e R$ 499,99 permitem no máximo 2 parcelas.',
        StatusCodes.BAD_REQUEST,
      );
    }

    if (totalValue >= 500 && installments > 3) {
      throw new AppError(
        'Valores a partir de R$ 500,00 permitem no máximo 3 parcelas.',
        StatusCodes.BAD_REQUEST,
      );
    }
  }

  private mapGatewayStatusToLocal(
    returnCode: string,
    webhookStatus?: number,
  ): 'PENDENTE' | 'PAGO' | 'CANCELADO' {
    return eRedeService.mapStatusToLocal(returnCode, webhookStatus);
  }

  private async updateStatusByGatewayCode(paymentId: string, returnCode: string): Promise<void> {
    const status = this.mapGatewayStatusToLocal(returnCode);
    await this.updateStatus(paymentId, status);
  }

  private async _checkActiveLinksLimit(userId: string): Promise<void> {
    const settingsRepository = await import('../repositories/SettingsRepository').then(m => m.default);
    const maxLinksStr = await settingsRepository.get('max_active_payment_links');
    const maxLinks = maxLinksStr ? parseInt(maxLinksStr, 10) : 5;
    const activeCount = await paymentRepository.countPendingByUser(userId);

    if (activeCount >= maxLinks) {
      throw new AppError(
        `Limite de ${maxLinks} link(s) de pagamento ativo(s) atingido.`,
        StatusCodes.TOO_MANY_REQUESTS,
      );
    }
  }

  private generateReferenceNum(userId: string): string {
    const shortUserId = userId.slice(0, 8);
    return `TPW-${Date.now()}-${shortUserId}`;
  }
}

export default new PaymentService();
