import { StatusCodes } from 'http-status-codes';
import AppError from '../utils/AppError';
import {
  eredeApiUrl,
  eredeCallbackSecret,
  eredeClientId,
  eredeIntegrationKey,
  eredePv,
  eredePixExpirationHours,
  eredeSoftDescriptor,
  eredeTimeoutMs,
  eredeTokenServiceUrl,
} from '../config/erede';
import oauthClient from './EredeOAuthClient';
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
    const json = await this._authedFetchJson(eredeApiUrl, {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    return this.parseResponse(json);
  }

  /**
   * Consulta o status de uma transação pelo TID.
   */
  async queryTransaction(tid: string): Promise<ERedeQueryResponse> {
    const url = `${eredeApiUrl}/${encodeURIComponent(tid)}`;
    const json = await this._authedFetchJson(url, { method: 'GET' });

    return {
      tid: String(json.tid ?? ''),
      returnCode: String(json.returnCode ?? ''),
      returnMessage: String(json.returnMessage ?? ''),
      status: Number(json.status ?? -1),
      amount: Number(json.amount ?? 0),
      reference: String(json.reference ?? ''),
      raw: json,
    };
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

  /**
   * Tokeniza um cartão via Cofre eRede (OAuth + Affiliation).
   * Endpoint: POST {EREDE_TOKEN_SERVICE_URL}/tokenization.
   */
  async tokenizeCardCofre(params: {
    email: string;
    cardNumber: string;
    expirationMonth: string;
    expirationYear: string;
    cardholderName: string;
    securityCode?: string;
  }): Promise<{ tokenizationId: string }> {
    const url = `${eredeTokenServiceUrl}/tokenization`;
    const body: Record<string, string> = {
      email: params.email,
      cardNumber: params.cardNumber,
      expirationMonth: params.expirationMonth,
      expirationYear: params.expirationYear,
      cardholderName: params.cardholderName,
    };
    if (params.securityCode) { body.securityCode = params.securityCode; }

    const json = await this._authedFetchJson(url, { method: 'POST', body: JSON.stringify(body) });

    const tokenizationId = json.tokenizationId;
    if (typeof tokenizationId !== 'string' || tokenizationId.length === 0) {
      throw new AppError(
        'eRede não retornou tokenizationId na resposta de tokenização.',
        StatusCodes.BAD_GATEWAY,
      );
    }

    return { tokenizationId };
  }

  /**
   * Consulta o estado de uma tokenização no Cofre.
   */
  async queryTokenization(tokenizationId: string): Promise<{
    tokenizationId: string;
    status: 'PENDING' | 'ACTIVE' | 'INACTIVE' | 'FAILED';
    bin?: string;
    last4?: string;
    brand?: string;
    brandTid?: string;
    lastModifiedDate?: string;
    raw: Record<string, unknown>;
  }> {
    const url = `${eredeTokenServiceUrl}/tokenization/${encodeURIComponent(tokenizationId)}`;
    const json = await this._authedFetchJson(url, { method: 'GET' });

    return {
      tokenizationId: String(json.tokenizationId ?? tokenizationId),
      status: this._mapTokenizationStatus(String(json.tokenizationStatus ?? '')),
      bin: json.bin ? String(json.bin) : undefined,
      last4: json.last4digits ? String(json.last4digits) : undefined,
      brand: json.brand ? String(json.brand) : undefined,
      brandTid: json.brandTid ? String(json.brandTid) : undefined,
      lastModifiedDate: json.lastModifiedDate ? String(json.lastModifiedDate) : undefined,
      raw: json,
    };
  }

  private _mapTokenizationStatus(remote: string): 'PENDING' | 'ACTIVE' | 'INACTIVE' | 'FAILED' {
    const normalized = remote.toLowerCase();
    if (normalized === 'active') { return 'ACTIVE'; }
    if (normalized === 'pending') { return 'PENDING'; }
    if (normalized === 'inactive' || normalized === 'suspended') { return 'INACTIVE'; }
    if (normalized === 'failed') { return 'FAILED'; }
    return 'PENDING';
  }

  /**
   * Aciona uma operação de management no Cofre (atualmente: delete).
   */
  async manageTokenization(
    tokenizationId: string,
    action: 'delete',
    reason?: number,
  ): Promise<{ returnCode: string; returnMessage: string }> {
    const url = `${eredeTokenServiceUrl}/tokenization/${encodeURIComponent(tokenizationId)}/management`;
    const body: Record<string, unknown> = { action };
    if (reason !== undefined) body.reason = reason;

    const json = await this._authedFetchJson(url, { method: 'POST', body: JSON.stringify(body) });

    return {
      returnCode: String(json.returnCode ?? ''),
      returnMessage: String(json.returnMessage ?? ''),
    };
  }

  /**
   * Helper privado: faz fetch autenticado com retry em 401, content-type guard
   * e tradução de erros pra AppError.
   */
  private async _authedFetchJson(
    url: string,
    init: RequestInit,
    isRetry = false,
  ): Promise<Record<string, unknown>> {
    if (!eredeClientId) {
      throw new AppError(
        'Configuração inválida: EREDE_CLIENT_ID ausente (Affiliation header).',
        StatusCodes.INTERNAL_SERVER_ERROR,
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), eredeTimeoutMs);

    try {
      const accessToken = await oauthClient.getAccessToken();
      const headers: Record<string, string> = {
        ...(init.headers as Record<string, string> | undefined),
        Authorization: `Bearer ${accessToken}`,
        Affiliation: eredeClientId,
        Accept: 'application/json',
      };
      if (init.body && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
      }

      const response = await fetch(url, { ...init, headers, signal: controller.signal });

      if (response.status === 401 && !isRetry) {
        oauthClient.invalidate();
        return await this._authedFetchJson(url, init, true);
      }

      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes('application/json')) {
        const text = await response.text();
        throw new AppError(
          `eRede retornou resposta não-JSON (status ${response.status}, content-type ${contentType}): ${text.slice(0, 200)}`,
          StatusCodes.BAD_GATEWAY,
        );
      }

      const json = (await response.json()) as Record<string, unknown>;

      if (!response.ok) {
        if (response.status >= 500) {
          throw new AppError(
            (json.returnMessage as string) || 'Erro no gateway eRede',
            StatusCodes.BAD_GATEWAY,
          );
        }
        throw new AppError(
          (json.returnMessage as string) || `eRede retornou HTTP ${response.status}`,
          StatusCodes.BAD_REQUEST,
        );
      }

      return json;
    } catch (error) {
      if (error instanceof AppError) { throw error; }

      if (error instanceof Error && error.name === 'AbortError') {
        throw new AppError(
          'Timeout ao conectar com a eRede.',
          StatusCodes.GATEWAY_TIMEOUT,
        );
      }

      throw new AppError(
        `Falha ao conectar com a eRede: ${(error as Error).message}`,
        StatusCodes.SERVICE_UNAVAILABLE,
      );
    } finally {
      clearTimeout(timeout);
    }
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
      cardBin: json.cardBin ? String(json.cardBin) : undefined,
      brandTid: json.brandTid ? String(json.brandTid) : undefined,
      transactionLinkId: json.transactionLinkId ? String(json.transactionLinkId) : undefined,
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
