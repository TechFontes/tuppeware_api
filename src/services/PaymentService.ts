import { StatusCodes } from 'http-status-codes';
import AppError from '../utils/AppError';
import { getPaginationParams, paginatedResponse } from '../utils/pagination';
import paymentRepository from '../repositories/PaymentRepository';
import debtRepository from '../repositories/DebtRepository';
import eRedeService from './ERedeService';
import webSocketService from './WebSocketService';
import savedCardService from './SavedCardService';
import settingsRepository from '../repositories/SettingsRepository';
import userRepository from '../repositories/UserRepository';
import debtService from './DebtService';
import webhookDispatcher, { type PaymentConfirmedEvent } from './WebhookDispatcher';
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
   * Valida que os débitos existem e nenhum está pago.
   */
  private async _validateDebtsExist(debtIds: string[]) {
    const debts = await debtRepository.findByIds(debtIds);

    if (debts.length === 0) {
      throw new AppError('Nenhum débito válido encontrado.', StatusCodes.BAD_REQUEST);
    }

    if (debts.length !== debtIds.length) {
      throw new AppError('Alguns débitos não foram encontrados.', StatusCodes.BAD_REQUEST);
    }

    const paidDebts = debts.filter((d) => d.status === 'PAGO');

    if (paidDebts.length > 0) {
      throw new AppError('Alguns débitos selecionados já estão pagos.', StatusCodes.BAD_REQUEST);
    }

    return debts;
  }

  /**
   * Chama o gateway eRede para uma transação PIX.
   */
  private async _callGatewayPix(amountCents: number, referenceNum: string) {
    const pixPayload = eRedeService.buildPixPayload(referenceNum, amountCents);
    return await eRedeService.createTransaction(pixPayload);
  }

  /**
   * Persiste o pagamento no banco de dados.
   */
  private async _persistPayment(params: {
    userId: string;
    method: 'PIX' | 'CARTAO_CREDITO';
    installments: number;
    subtotal: number;
    fee: number;
    totalValue: number;
    status: 'PENDENTE' | 'PAGO' | 'CANCELADO';
    referenceNum: string;
    gatewayTransactionId?: string | null;
    gatewayOrderId?: string | null;
    gatewayStatusCode?: string | null;
    gatewayStatusMessage?: string | null;
    processorReference?: string | null;
    paymentLink?: string | null;
    qrCode?: string | null;
    nsu?: string | null;
    authorizationCode?: string | null;
    debtIds: string[];
    isPartial?: boolean;
  }) {
    return await paymentRepository.create({
      userId: params.userId,
      method: params.method,
      installments: params.installments,
      subtotal: params.subtotal,
      fee: params.fee,
      totalValue: params.totalValue,
      status: params.status,
      gatewayProvider: 'EREDE',
      referenceNum: params.referenceNum,
      gatewayTransactionId: params.gatewayTransactionId ?? null,
      gatewayOrderId: params.gatewayOrderId ?? null,
      gatewayStatusCode: params.gatewayStatusCode ?? null,
      gatewayStatusMessage: params.gatewayStatusMessage ?? null,
      processorReference: params.processorReference ?? null,
      paymentLink: params.paymentLink ?? null,
      qrCode: params.qrCode ?? null,
      nsu: params.nsu ?? null,
      authorizationCode: params.authorizationCode ?? null,
      isPartial: params.isPartial ?? false,
      paymentDebts: {
        create: params.debtIds.map((debtId) => ({ debtId })),
      },
    });
  }

  /**
   * Cria um pagamento na eRede.
   */
  async create(userId: string, payload: CreatePaymentDTO) {
    const { debtIds, method, installments, billing, saveCard, savedCardId } = payload;
    let card = payload.card;

    // Busca e valida os débitos selecionados
    const debts = await this._validateDebtsExist(debtIds);

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
      const savedCard = await savedCardService.assertActiveForCharge(userId, savedCardId);
      if (!card?.cvv) {
        throw new AppError('CVV é obrigatório ao pagar com cartão salvo.', StatusCodes.BAD_REQUEST);
      }
      cardToken = savedCard.tokenizationId;
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

    // Cria transação na eRede
    const gatewayResponse = method === 'PIX'
      ? await this._callGatewayPix(amountCents, referenceNum)
      : await eRedeService.createTransaction(eRedeService.buildCreditPayload({
          reference: referenceNum,
          amountCents,
          installments: installments || 1,
          card: card!,
          billing: billing!,
          cardToken,
        }));

    // Determina status inicial com base no returnCode antes de criar o registro
    const initialStatus = eRedeService.mapStatusToLocal(gatewayResponse.returnCode);

    // Cria o pagamento no banco com status já definido (evita update separado pós-criação)
    const payment = await this._persistPayment({
      userId,
      method,
      installments: method === 'CARTAO_CREDITO' ? (installments || 1) : 1,
      subtotal,
      fee,
      totalValue,
      status: initialStatus,
      referenceNum,
      gatewayTransactionId: gatewayResponse.tid || null,
      gatewayOrderId: gatewayResponse.nsu || null,
      gatewayStatusCode: gatewayResponse.returnCode,
      gatewayStatusMessage: gatewayResponse.returnMessage,
      processorReference: gatewayResponse.authorizationCode || null,
      paymentLink: gatewayResponse.pix?.link || null,
      qrCode: gatewayResponse.pix?.qrCode || null,
      nsu: gatewayResponse.nsu ?? null,
      authorizationCode: gatewayResponse.authorizationCode ?? null,
      debtIds,
    });

    // Persiste campos novos da Rede v2 (e link com saved_card)
    if (method === 'CARTAO_CREDITO' && (
      gatewayResponse.cardBin || gatewayResponse.brandTid || gatewayResponse.transactionLinkId || savedCardId
    )) {
      await paymentRepository.update(payment.id, {
        cardBin: gatewayResponse.cardBin ?? null,
        brandTid: gatewayResponse.brandTid ?? null,
        transactionLinkId: gatewayResponse.transactionLinkId ?? null,
        ...(savedCardId ? { savedCard: { connect: { id: savedCardId } } } : {}),
      });
    }

    // Atualiza débitos se pagamento aprovado imediatamente
    if (initialStatus === 'PAGO') {
      await debtRepository.updateMany({ id: { in: debtIds } }, { status: 'PAGO' });
    }

    // Tokeniza e salva o cartão se solicitado e pagamento aprovado
    if (method === 'CARTAO_CREDITO' && saveCard && card && gatewayResponse.returnCode === '00') {
      try {
        const user = await userRepository.findById(userId);
        await savedCardService.tokenizeAndSave({
          userId,
          email: user?.email ?? billing?.email ?? '',
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

    const updateData: Prisma.PaymentUpdateInput = {
      status: localStatus,
      gatewayStatusCode: returnCode,
      gatewayStatusMessage: String(eredeStatus ?? ''),
      gatewayTransactionId: tid || payment.gatewayTransactionId,
      callbackPayload: callbackPayload as unknown as Prisma.InputJsonValue,
    };

    if (callbackPayload.nsu) {
      updateData.nsu = callbackPayload.nsu;
    }
    if (callbackPayload.authorizationCode) {
      updateData.authorizationCode = callbackPayload.authorizationCode;
    }

    const updated = await paymentRepository.update(payment.id, updateData);

    if (localStatus === 'PAGO') {
      if (payment.isPartial && payment.paymentDebts.length > 0) {
        // Pagamento parcial: acumula paidAmount com optimistic lock
        const linkedDebt = (payment.paymentDebts[0] as unknown as { debtId: string; debt: { id: string; codigo: string; valor: number | string; paidAmount: number | string; status: string } }).debt;
        const valorNum = parseFloat(linkedDebt.valor.toString());
        const incremento = parseFloat(payment.totalValue.toString());

        let currentPaid = parseFloat(linkedDebt.paidAmount.toString());
        let currentStatus = linkedDebt.status;
        let updated2 = false;

        for (let attempt = 0; attempt < 3 && !updated2; attempt++) {
          const novoPaid = currentPaid + incremento;
          const quitou = novoPaid >= valorNum;
          const novoStatus = quitou ? 'PAGO' : currentStatus;

          updated2 = await debtRepository.updateDebtPaidAmount(
            linkedDebt.id,
            currentPaid.toFixed(2),
            novoPaid.toFixed(2),
            novoStatus as 'PENDENTE' | 'ATRASADO' | 'PAGO',
          );

          if (!updated2) {
            const fresh = await debtRepository.findById(linkedDebt.id);
            if (!fresh) break;
            currentPaid = parseFloat((fresh.paidAmount as unknown as string).toString());
            currentStatus = fresh.status;
          } else {
            const paidAmountFinal = currentPaid + incremento;
            const remaining = Math.max(0, valorNum - paidAmountFinal);
            const statusFinal = (paidAmountFinal >= valorNum ? 'PAGO' : currentStatus) as 'PENDENTE' | 'ATRASADO' | 'PAGO';

            // Dispara webhook async após commit
            const user = await userRepository.findById(payment.userId);
            const event: PaymentConfirmedEvent = {
              eventId: payment.id,
              eventType: 'payment.confirmed',
              paymentType: 'PARTIAL',
              timestamp: new Date().toISOString(),
              payment: {
                id: payment.id,
                referenceNum: payment.referenceNum!,
                method: payment.method,
                amount: parseFloat(payment.totalValue.toString()),
                paidAt: new Date().toISOString(),
              },
              debt: {
                id: linkedDebt.id,
                codigo: linkedDebt.codigo,
                valor: valorNum,
                paidAmount: paidAmountFinal,
                remaining,
                status: statusFinal,
              },
              user: { id: user!.id, cpf: user!.cpf },
            };

            setImmediate(() => {
              webhookDispatcher.send(event).catch((err) =>
                console.error('[PaymentService] webhook send failed', err),
              );
            });
          }
        }

        if (!updated2) {
          throw new AppError('Conflito ao atualizar paidAmount após 3 tentativas', StatusCodes.CONFLICT);
        }
      } else {
        // Pagamento total: fluxo original
        const debtIds = updated.paymentDebts.map((pd: { debtId: string }) => pd.debtId);
        await debtRepository.updateMany({ id: { in: debtIds } }, { status: 'PAGO' });

        // Dispara webhook async para pagamento total
        if (payment.paymentDebts.length > 0) {
          const primaryDebtEntry = payment.paymentDebts[0] as unknown as { debtId: string; debt?: { id: string; codigo: string; valor: number | string; paidAmount: number | string; status: string } };
          const primaryDebt = primaryDebtEntry.debt;
          if (primaryDebt) {
            const user = await userRepository.findById(payment.userId);
            const valor = parseFloat(primaryDebt.valor.toString());
            const event: PaymentConfirmedEvent = {
              eventId: payment.id,
              eventType: 'payment.confirmed',
              paymentType: 'FULL',
              timestamp: new Date().toISOString(),
              payment: {
                id: payment.id,
                referenceNum: payment.referenceNum!,
                method: payment.method,
                amount: parseFloat(payment.totalValue.toString()),
                paidAt: new Date().toISOString(),
              },
              debt: {
                id: primaryDebt.id,
                codigo: primaryDebt.codigo,
                valor,
                paidAmount: valor,
                remaining: 0,
                status: 'PAGO',
              },
              user: { id: user!.id, cpf: user!.cpf },
            };

            setImmediate(() => {
              webhookDispatcher.send(event).catch((err) =>
                console.error('[PaymentService] webhook send failed', err),
              );
            });
          }
        }
      }
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
   * Cria um pagamento parcial (PIX) para uma única dívida.
   * Filtra por hierarquia do usuário: CONSULTOR só acessa dívidas do seu código.
   */
  async createPartial(
    userId: string,
    dto: { debtId: string; amount: number },
    user?: { id: string; role: string; cpf?: string },
  ) {
    const settings = await settingsRepository.getAll();
    if (settings.partial_payment_enabled !== 'true') {
      throw new AppError('Pagamento parcial desabilitado', StatusCodes.FORBIDDEN);
    }

    const minAmount = parseFloat(settings.partial_payment_min_amount ?? '0');
    const minRemaining = parseFloat(settings.partial_payment_min_remaining ?? '0');

    const debt = await debtService.getByIdForUser(dto.debtId, user);
    if (!debt) {
      throw new AppError('Dívida não encontrada', StatusCodes.NOT_FOUND);
    }
    if (debt.status === 'PAGO') {
      throw new AppError('Dívida já paga', StatusCodes.BAD_REQUEST);
    }

    if (dto.amount < minAmount) {
      throw new AppError(
        `Valor mínimo para pagamento parcial: R$ ${minAmount.toFixed(2)}`,
        StatusCodes.BAD_REQUEST,
      );
    }

    const valor = parseFloat(debt.valor.toString());
    const paid = parseFloat(debt.paidAmount.toString());
    const remaining = valor - paid;

    if (dto.amount > remaining) {
      throw new AppError(
        `Valor excede o restante (R$ ${remaining.toFixed(2)})`,
        StatusCodes.BAD_REQUEST,
      );
    }

    const remainingAfter = remaining - dto.amount;
    if (remainingAfter !== 0 && remainingAfter < minRemaining) {
      throw new AppError(
        `Após o parcial deve sobrar R$ 0 ou ≥ R$ ${minRemaining.toFixed(2)}`,
        StatusCodes.BAD_REQUEST,
      );
    }

    const amountCents = Math.round(dto.amount * 100);
    const referenceNum = this.generateReferenceNum(userId);

    const dbUser = await userRepository.findById(userId);
    if (!dbUser) {
      throw new AppError('Usuário não encontrado', StatusCodes.NOT_FOUND);
    }

    const gatewayResp = await this._callGatewayPix(amountCents, referenceNum);

    const payment = await this._persistPayment({
      userId,
      method: 'PIX',
      installments: 1,
      subtotal: dto.amount,
      fee: 0,
      totalValue: dto.amount,
      status: 'PENDENTE',
      referenceNum,
      gatewayTransactionId: gatewayResp.tid || null,
      gatewayStatusCode: gatewayResp.returnCode || null,
      gatewayStatusMessage: gatewayResp.returnMessage || null,
      paymentLink: gatewayResp.pix?.link || null,
      qrCode: gatewayResp.pix?.qrCode ?? (gatewayResp as any).qrCode ?? null,
      nsu: gatewayResp.nsu ?? null,
      authorizationCode: gatewayResp.authorizationCode ?? null,
      debtIds: [dto.debtId],
      isPartial: true,
    });

    return {
      paymentId: payment.id,
      referenceNum: payment.referenceNum,
      qrCode: payment.qrCode,
    };
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
