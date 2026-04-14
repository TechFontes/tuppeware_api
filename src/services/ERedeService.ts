import { StatusCodes } from 'http-status-codes';
import AppError from '../utils/AppError';
import {
  eredeApiUrl,
  eredeCallbackSecret,
  eredeIntegrationKey,
  eredePv,
  eredePixExpirationHours,
  eredeSoftDescriptor,
  eredeTimeoutMs,
} from '../config/erede';
import type {
  ERedeTransactionRequest,
  ERedePixRequest,
  ERedeCreditRequest,
  ERedeTransactionResponse,
  ERedeCallbackPayload,
  ERedeQueryResponse,
} from '../types';

class ERedeService {
  private readonly baseUrl: string;
  private readonly pv: string;
  private readonly integrationKey: string;
  private readonly timeoutMs: number;

  constructor() {
    this.baseUrl = eredeApiUrl;
    this.pv = eredePv;
    this.integrationKey = eredeIntegrationKey;
    this.timeoutMs = eredeTimeoutMs;
  }

  /**
   * Cria uma transação na eRede (PIX ou cartão de crédito).
   */
  async createTransaction(payload: ERedeTransactionRequest): Promise<ERedeTransactionResponse> {
    this.validateConfig();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: this.buildBasicAuth(),
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const json = await response.json() as Record<string, unknown>;

      if (!response.ok) {
        const errMsg = (json.returnMessage as string)
          || (json.message as string)
          || 'Erro ao processar transação na eRede.';
        throw new AppError(errMsg, StatusCodes.BAD_GATEWAY);
      }

      return this.parseResponse(json);
    } catch (error) {
      if (error instanceof AppError) throw error;

      if (error instanceof Error && error.name === 'AbortError') {
        throw new AppError('Timeout ao conectar com a eRede.', StatusCodes.GATEWAY_TIMEOUT);
      }

      throw new AppError(
        `Falha ao conectar com a eRede: ${(error as Error).message}`,
        StatusCodes.SERVICE_UNAVAILABLE,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Consulta o status de uma transação pelo TID.
   */
  async queryTransaction(tid: string): Promise<ERedeQueryResponse> {
    this.validateConfig();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/${tid}`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: this.buildBasicAuth(),
        },
        signal: controller.signal,
      });

      const json = await response.json() as Record<string, unknown>;

      if (!response.ok) {
        const errMsg = (json.returnMessage as string) || 'Erro ao consultar transação na eRede.';
        throw new AppError(errMsg, StatusCodes.BAD_GATEWAY);
      }

      return {
        tid: String(json.tid ?? ''),
        returnCode: String(json.returnCode ?? ''),
        returnMessage: String(json.returnMessage ?? ''),
        status: Number(json.status ?? -1),
        amount: Number(json.amount ?? 0),
        reference: String(json.reference ?? ''),
        raw: json,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;

      if (error instanceof Error && error.name === 'AbortError') {
        throw new AppError('Timeout ao consultar transação na eRede.', StatusCodes.GATEWAY_TIMEOUT);
      }

      throw new AppError(
        `Falha ao consultar transação na eRede: ${(error as Error).message}`,
        StatusCodes.SERVICE_UNAVAILABLE,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Tokeniza um cartão de crédito para pagamentos futuros.
   * Retorna o token que pode ser armazenado no banco.
   */
  async tokenizeCard(cardData: {
    number: string;
    expMonth: string;
    expYear: string;
    holderName: string;
  }): Promise<{ token: string; lastFour: string; brand: string }> {
    this.validateConfig();

    const tokenUrl = this.baseUrl.replace('/transactions', '/tokens');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: this.buildBasicAuth(),
        },
        body: JSON.stringify({
          cardNumber: cardData.number,
          expirationMonth: cardData.expMonth,
          expirationYear: cardData.expYear,
          cardHolderName: cardData.holderName,
        }),
        signal: controller.signal,
      });

      const json = await response.json() as Record<string, unknown>;

      if (!response.ok) {
        const errMsg = (json.returnMessage as string) || 'Erro ao tokenizar cartão na eRede.';
        throw new AppError(errMsg, StatusCodes.BAD_GATEWAY);
      }

      return {
        token: String(json.token ?? ''),
        lastFour: String(json.last4digits ?? cardData.number.slice(-4)),
        brand: String(json.brand ?? ''),
      };
    } catch (error) {
      if (error instanceof AppError) throw error;

      if (error instanceof Error && error.name === 'AbortError') {
        throw new AppError('Timeout ao tokenizar cartão na eRede.', StatusCodes.GATEWAY_TIMEOUT);
      }

      throw new AppError(
        `Falha ao tokenizar cartão: ${(error as Error).message}`,
        StatusCodes.SERVICE_UNAVAILABLE,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Valida o payload recebido no callback da eRede.
   * A eRede não usa HMAC - verificamos apenas a estrutura mínima.
   * Segurança adicional via HTTPS + firewall/IP whitelist em produção.
   */
  validateCallbackSignature(payload: ERedeCallbackPayload): boolean {
    if (!payload || !payload.tid || payload.returnCode === undefined) {
      return false;
    }

    // Se um secret foi configurado, pode ser checado via header customizado no controller
    if (eredeCallbackSecret) {
      return true; // lógica de header custom deve ser feita no controller
    }

    return true;
  }

  /**
   * Mapeia returnCode + status numérico da eRede para o status local do sistema.
   * - returnCode "00" = aprovado → PAGO
   * - status 3 = pendente → PENDENTE
   * - status 4 ou outros = cancelado → CANCELADO
   */
  mapStatusToLocal(returnCode: string, webhookStatus?: number): 'PENDENTE' | 'PAGO' | 'CANCELADO' {
    if (returnCode === '00') {
      return 'PAGO';
    }

    if (webhookStatus !== undefined) {
      if (webhookStatus === 0) return 'PAGO';
      if (webhookStatus === 3) return 'PENDENTE';
      if (webhookStatus === 4) return 'CANCELADO';
    }

    return 'CANCELADO';
  }

  /**
   * Monta o payload de criação para PIX.
   */
  buildPixPayload(reference: string, amountCents: number): ERedePixRequest {
    const expiration = new Date(Date.now() + eredePixExpirationHours * 60 * 60 * 1000);

    return {
      kind: 'pix',
      reference,
      amount: amountCents,
      expirationDate: expiration.toISOString(),
    };
  }

  /**
   * Monta o payload de criação para cartão de crédito.
   */
  buildCreditPayload(params: {
    reference: string;
    amountCents: number;
    installments: number;
    card: {
      number: string;
      expMonth: string;
      expYear: string;
      cvv: string;
      holderName: string;
    };
    billing: {
      name: string;
      document: string;
      email: string;
      address: string;
      address2?: string;
      district: string;
      city: string;
      state: string;
      postalcode: string;
      country?: string;
    };
    cardToken?: string;
  }): ERedeCreditRequest {
    const cardField = params.cardToken
      ? { cardToken: params.cardToken }
      : { cardNumber: params.card.number };

    return {
      kind: 'credit',
      reference: params.reference,
      amount: params.amountCents,
      installments: params.installments,
      cardHolderName: params.card.holderName,
      ...cardField,
      expirationMonth: params.card.expMonth,
      expirationYear: params.card.expYear,
      securityCode: params.card.cvv,
      capture: true,
      softDescriptor: eredeSoftDescriptor,
      billing: {
        name: params.billing.name,
        document: params.billing.document.replace(/\D/g, ''),
        email: params.billing.email,
        address: {
          street: params.billing.address,
          number: 'S/N',
          complement: params.billing.address2 || '',
          district: params.billing.district,
          city: params.billing.city,
          state: params.billing.state,
          zipCode: params.billing.postalcode,
          country: this.normalizeCountry(params.billing.country || 'BR'),
        },
      },
    };
  }

  private buildBasicAuth(): string {
    const credentials = Buffer.from(`${this.pv}:${this.integrationKey}`).toString('base64');
    return `Basic ${credentials}`;
  }

  private validateConfig(): void {
    if (!this.pv || !this.integrationKey) {
      throw new AppError(
        'Credenciais da eRede não configuradas (EREDE_PV / EREDE_INTEGRATION_KEY).',
        StatusCodes.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private parseResponse(json: Record<string, unknown>): ERedeTransactionResponse {
    const pixData = json.pix as Record<string, unknown> | undefined;

    return {
      tid: String(json.tid ?? ''),
      returnCode: String(json.returnCode ?? ''),
      returnMessage: String(json.returnMessage ?? ''),
      reference: String(json.reference ?? ''),
      nsu: json.nsu ? String(json.nsu) : undefined,
      authorizationCode: json.authorizationCode ? String(json.authorizationCode) : undefined,
      dateTime: json.dateTime ? String(json.dateTime) : undefined,
      pix: pixData
        ? {
            qrCode: String(pixData.qrCode ?? ''),
            link: String(pixData.link ?? ''),
            expirationDate: String(pixData.expirationDate ?? ''),
          }
        : undefined,
      raw: json,
    };
  }

  /** Converte ISO alpha-2 para alpha-3 exigido pela eRede. */
  private normalizeCountry(country: string): string {
    const map: Record<string, string> = { BR: 'BRA', US: 'USA', AR: 'ARG' };
    return map[country.toUpperCase()] ?? country;
  }
}

export default new ERedeService();
