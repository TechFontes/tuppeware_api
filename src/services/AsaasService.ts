import { StatusCodes } from 'http-status-codes';
import AppError from '../utils/AppError';
import { asaasApiUrl, asaasApiKey } from '../config/asaas';
import type { AsaasPaymentLink, CreatePaymentLinkParams } from '../types';

class AsaasService {
  private baseUrl: string;
  private apiKey: string;

  constructor() {
    this.baseUrl = asaasApiUrl;
    this.apiKey = asaasApiKey;
  }

  /**
   * Cria um link de pagamento na API do Asaas.
   */
  async createPaymentLink({ value, method, installments, description }: CreatePaymentLinkParams): Promise<AsaasPaymentLink> {
    try {
      const billingType = method === 'PIX' ? 'PIX' : 'CREDIT_CARD';

      const body = {
        name: description,
        billingType,
        chargeType: 'DETACHED',
        value,
        maxInstallmentCount: installments || 1,
        description,
      };

      const response = await fetch(`${this.baseUrl}/paymentLinks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          access_token: this.apiKey,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));

        console.error('Erro Asaas:', errorData);
        throw new AppError(
          'Erro ao gerar link de pagamento.',
          StatusCodes.BAD_GATEWAY,
        );
      }

      const data = await response.json() as { id: string; url: string };

      return {
        id: data.id,
        paymentLink: data.url,
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      console.error('Erro ao conectar com Asaas:', (error as Error).message);
      throw new AppError(
        'Não foi possível conectar ao serviço de pagamentos.',
        StatusCodes.SERVICE_UNAVAILABLE,
      );
    }
  }

  /**
   * Consulta o status de um pagamento no Asaas.
   */
  async getPaymentStatus(paymentLinkId: string) {
    try {
      const response = await fetch(`${this.baseUrl}/paymentLinks/${paymentLinkId}`, {
        method: 'GET',
        headers: {
          access_token: this.apiKey,
        },
      });

      if (!response.ok) {
        throw new AppError(
          'Erro ao consultar status do pagamento.',
          StatusCodes.BAD_GATEWAY,
        );
      }

      return response.json();
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      console.error('Erro ao consultar Asaas:', (error as Error).message);
      throw new AppError(
        'Não foi possível consultar o serviço de pagamentos.',
        StatusCodes.SERVICE_UNAVAILABLE,
      );
    }
  }
}

export default new AsaasService();
