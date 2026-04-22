import crypto from 'crypto';
import settingsRepository from '../repositories/SettingsRepository';

export interface PaymentConfirmedEvent {
  eventId: string;
  eventType: 'payment.confirmed';
  paymentType: 'PARTIAL' | 'FULL';
  timestamp: string;
  payment: {
    id: string;
    referenceNum: string;
    method: string;
    amount: number;
    paidAt: string;
  };
  debt: {
    id: string;
    codigo: string;
    valor: number;
    paidAmount: number;
    remaining: number;
    status: 'PENDENTE' | 'ATRASADO' | 'PAGO';
  };
  user: { id: string; cpf: string };
}

const MAX_ATTEMPTS = 3;
const TIMEOUT_MS = 5000;
const BACKOFFS_MS = [0, 2000, 8000];

class WebhookDispatcher {
  async send(event: PaymentConfirmedEvent): Promise<void> {
    const settings = await settingsRepository.getAll();
    const url = settings.payment_webhook_url;
    const secret = settings.payment_webhook_secret;

    if (!url) return;
    if (!secret) {
      console.warn('[WebhookDispatcher] URL configurada sem secret — abortando envio');
      return;
    }

    const body = JSON.stringify(event);
    const timestamp = Date.now().toString();
    const signature = crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Tuppeware-Event': event.eventType,
      'X-Tuppeware-Event-Id': event.eventId,
      'X-Tuppeware-Timestamp': timestamp,
      'X-Tuppeware-Signature': `sha256=${signature}`,
    };

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (BACKOFFS_MS[attempt] > 0) {
        await new Promise((r) => setTimeout(r, BACKOFFS_MS[attempt]));
      }
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
        const res = await fetch(url, { method: 'POST', headers, body, signal: ctrl.signal });
        clearTimeout(t);
        if (res.ok) return;
        console.error(`[WebhookDispatcher] tentativa ${attempt + 1}/${MAX_ATTEMPTS} falhou: HTTP ${res.status}`);
      } catch (err) {
        console.error(`[WebhookDispatcher] tentativa ${attempt + 1}/${MAX_ATTEMPTS} erro:`, err);
      }
    }
    console.error(`[WebhookDispatcher] desistiu após ${MAX_ATTEMPTS} tentativas — eventId=${event.eventId}`);
  }
}

export default new WebhookDispatcher();
