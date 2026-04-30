import prisma from '../config/database';
import type { EredeWebhookEvent, EredeWebhookEventType, Prisma } from '../../generated/prisma/client';

interface CreateEventInput {
  externalId: string;
  eventType: EredeWebhookEventType;
  events: string[];
  payload: Record<string, unknown>;
}

class EredeWebhookRepository {
  async findByExternalId(externalId: string): Promise<EredeWebhookEvent | null> {
    return await prisma.eredeWebhookEvent.findUnique({ where: { externalId } });
  }

  async create(data: CreateEventInput): Promise<EredeWebhookEvent> {
    return await prisma.eredeWebhookEvent.create({
      data: {
        externalId: data.externalId,
        eventType: data.eventType,
        events: data.events as unknown as Prisma.InputJsonValue,
        payload: data.payload as unknown as Prisma.InputJsonValue,
        processed: false,
      },
    });
  }

  async markProcessed(id: string): Promise<EredeWebhookEvent> {
    return await prisma.eredeWebhookEvent.update({
      where: { id },
      data: { processed: true, processedAt: new Date(), errorMessage: null },
    });
  }

  async markFailed(id: string, errorMessage: string): Promise<EredeWebhookEvent> {
    return await prisma.eredeWebhookEvent.update({
      where: { id },
      data: { processed: false, errorMessage },
    });
  }
}

export default new EredeWebhookRepository();
