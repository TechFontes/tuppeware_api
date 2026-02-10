import { StatusCodes } from 'http-status-codes';
import AppError from '../utils/AppError';
import { getPaginationParams, paginatedResponse } from '../utils/pagination';
import paymentRepository from '../repositories/PaymentRepository';
import debtRepository from '../repositories/DebtRepository';
import asaasService from './AsaasService';
import webSocketService from './WebSocketService';
import type { CreatePaymentDTO } from '../types';

const CREDIT_CARD_FEE_RATE = 0.05; // 5%

interface PaymentQuery {
  page?: string;
  limit?: string;
  status?: string;
  search?: string;
}

class PaymentService {
  /**
   * Cria um pagamento e gera link via Asaas.
   */
  async create(userId: string, { debtIds, method, installments }: CreatePaymentDTO) {
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

      // Valida regras de parcelamento
      this._validateInstallments(totalValue, installments);
    } else {
      // PIX: sem parcelamento
      if (installments && installments > 1) {
        throw new AppError('PIX não permite parcelamento.', StatusCodes.BAD_REQUEST);
      }
    }

    // Gera link de pagamento via Asaas
    const asaasPayment = await asaasService.createPaymentLink({
      value: totalValue,
      method,
      installments: method === 'CARTAO_CREDITO' ? (installments || 1) : 1,
      description: `Pagamento de ${debts.length} débito(s)`,
    });

    // Cria o pagamento no banco
    const payment = await paymentRepository.create({
      userId,
      method,
      installments: method === 'CARTAO_CREDITO' ? (installments || 1) : 1,
      subtotal,
      fee,
      totalValue,
      paymentLink: asaasPayment.paymentLink,
      asaasId: asaasPayment.id,
      paymentDebts: {
        create: debtIds.map((debtId) => ({ debtId })),
      },
    });

    // Emite evento via WebSocket
    webSocketService.emitToUser(userId, 'payment:created', {
      paymentId: payment.id,
      totalValue,
      method,
    });

    return payment;
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
        { paymentDebts: { some: { debt: { numeroNf: { contains: query.search, mode: 'insensitive' } } } } },
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
   * Atualiza o status de um pagamento (usado por webhook/admin).
   */
  async updateStatus(paymentId: string, status: string) {
    const payment = await paymentRepository.update(paymentId, { status: status as 'PENDENTE' | 'PAGO' | 'CANCELADO' });

    // Se pago, atualiza status dos débitos vinculados
    if (status === 'PAGO') {
      const debtIds = payment.paymentDebts.map((pd: { debtId: string }) => pd.debtId);

      await debtRepository.updateMany({ id: { in: debtIds } }, { status: 'PAGO' });
    }

    // Emite evento via WebSocket
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
}

export default new PaymentService();
