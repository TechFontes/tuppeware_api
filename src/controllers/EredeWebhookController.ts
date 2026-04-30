import { Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';
import eredeWebhookRepository from '../repositories/EredeWebhookRepository';
import eredeWebhookService from '../services/EredeWebhookService';
import type { EredeWebhookEventType } from '../../generated/prisma/client';
import { timingSafeStringCompare } from '../utils/timingSafeStringCompare';

interface WebhookBody {
  eventType?: string;
  tokenizationId?: string;
  tid?: string;
  [key: string]: unknown;
}

class EredeWebhookController {
  async handle(req: Request, res: Response, _next: NextFunction): Promise<void> {
    // 5.2.1 — secret (lido dinamicamente para suportar variação em testes)
    const callbackSecret = process.env.EREDE_CALLBACK_SECRET || '';
    if (callbackSecret) {
      const provided = req.headers['x-erede-secret'];
      if (typeof provided !== 'string' || !timingSafeStringCompare(provided, callbackSecret)) {
        res.status(StatusCodes.UNAUTHORIZED).json({ status: 'fail', message: 'Webhook não autorizado' });
        return;
      }
    }

    // 5.2.2 — Request-ID
    const externalId = (req.headers['request-id'] as string | undefined) ?? '';
    if (!externalId) {
      res.status(StatusCodes.BAD_REQUEST).json({ status: 'fail', message: 'Request-ID obrigatório' });
      return;
    }

    // 5.2.3 — eventType
    const body = (req.body ?? {}) as WebhookBody;
    const eventTypeRaw = String(body.eventType ?? '');
    const isToken = eventTypeRaw.startsWith('PV.TOKENIZACAO');
    const isTx = eventTypeRaw.startsWith('PV.TRANSACAO');
    if (!isToken && !isTx) {
      res.status(StatusCodes.BAD_REQUEST).json({ status: 'fail', message: 'Evento não suportado' });
      return;
    }

    const eventType: EredeWebhookEventType = isToken ? 'TOKENIZATION' : 'TRANSACTION';

    // 5.3 — idempotência
    const existing = await eredeWebhookRepository.findByExternalId(externalId);
    let eventId: string;
    if (existing) {
      if (existing.processed) {
        res.status(StatusCodes.OK).json({ status: 'ok', duplicate: true });
        return;
      }
      eventId = existing.id;
    } else {
      const created = await eredeWebhookRepository.create({
        externalId,
        eventType,
        events: [eventTypeRaw],
        payload: body,
      });
      eventId = created.id;
    }

    // 5.4-5.5 — processar
    try {
      if (eventType === 'TOKENIZATION') {
        const tokenizationId = String(body.tokenizationId ?? '');
        if (!tokenizationId) {
          throw new Error('payload sem tokenizationId');
        }
        await eredeWebhookService.syncTokenization(tokenizationId);
      } else {
        const tid = String(body.tid ?? '');
        if (!tid) {
          throw new Error('payload sem tid');
        }
        await eredeWebhookService.syncTransaction(tid);
      }

      await eredeWebhookRepository.markProcessed(eventId);
      res.status(StatusCodes.OK).json({ status: 'ok' });
    } catch (err) {
      const errorMessage = (err as Error).message;
      await eredeWebhookRepository.markFailed(eventId, errorMessage);
      res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ status: 'error', message: errorMessage });
    }
  }
}

export default new EredeWebhookController();
