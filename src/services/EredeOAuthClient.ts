import { StatusCodes } from 'http-status-codes';
import AppError from '../utils/AppError';
import {
  eredeClientId,
  eredeClientSecret,
  eredeOAuthUrl,
  eredeTimeoutMs,
} from '../config/erede';

interface CachedToken {
  token: string;
  expiresAt: number; // epoch ms
}

class EredeOAuthClient {
  private cached: CachedToken | null = null;
  private inflight: Promise<string> | null = null;

  async getAccessToken(): Promise<string> {
    const now = Date.now();

    if (this.cached && this.cached.expiresAt - 60_000 > now) {
      return this.cached.token;
    }

    if (this.inflight) {
      return this.inflight;
    }

    this.inflight = this._fetchNewToken().finally(() => {
      this.inflight = null;
    });

    return this.inflight;
  }

  invalidate(): void {
    this.cached = null;
  }

  private async _fetchNewToken(): Promise<string> {
    if (!eredeClientId || !eredeClientSecret) {
      throw new AppError(
        'Credenciais eRede OAuth não configuradas (EREDE_CLIENT_ID / EREDE_CLIENT_SECRET).',
        StatusCodes.INTERNAL_SERVER_ERROR,
      );
    }

    const credentials = Buffer.from(`${eredeClientId}:${eredeClientSecret}`).toString('base64');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), eredeTimeoutMs);

    try {
      const response = await fetch(eredeOAuthUrl, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: 'grant_type=client_credentials',
        signal: controller.signal,
      });

      if (response.status === 401) {
        throw new AppError(
          'Credenciais eRede OAuth inválidas.',
          StatusCodes.INTERNAL_SERVER_ERROR,
        );
      }

      if (response.status >= 500) {
        throw new AppError(
          'Erro no gateway eRede ao autenticar.',
          StatusCodes.SERVICE_UNAVAILABLE,
        );
      }

      if (!response.ok) {
        throw new AppError(
          `Falha na autenticação eRede (HTTP ${response.status}).`,
          StatusCodes.INTERNAL_SERVER_ERROR,
        );
      }

      const json = (await response.json()) as { access_token: string; expires_in: number };

      this.cached = {
        token: json.access_token,
        expiresAt: Date.now() + json.expires_in * 1000,
      };

      return this.cached.token;
    } catch (error) {
      if (error instanceof AppError) { throw error; }

      if (error instanceof Error && error.name === 'AbortError') {
        throw new AppError(
          'Timeout ao autenticar com a eRede.',
          StatusCodes.GATEWAY_TIMEOUT,
        );
      }

      throw new AppError(
        `Falha ao conectar com a eRede OAuth: ${(error as Error).message}`,
        StatusCodes.SERVICE_UNAVAILABLE,
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}

export default new EredeOAuthClient();
