import prisma from '../config/database';
import type { SavedCard, Prisma, SavedCardStatus } from '../../generated/prisma/client';

interface UpdateStatusInput {
  status: SavedCardStatus;
  bin?: string | null;
  cardBrand?: string | null;
  lastFour?: string;
  brandTid?: string | null;
  lastSyncedAt?: Date;
}

class SavedCardRepository {
  async create(data: Prisma.SavedCardUncheckedCreateInput): Promise<SavedCard> {
    return await prisma.savedCard.create({ data });
  }

  async findByUserId(userId: string): Promise<SavedCard[]> {
    return await prisma.savedCard.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string): Promise<SavedCard | null> {
    return await prisma.savedCard.findUnique({ where: { id } });
  }

  async findByTokenizationId(tokenizationId: string): Promise<SavedCard | null> {
    return await prisma.savedCard.findUnique({ where: { tokenizationId } });
  }

  async findActiveForUser(userId: string, savedCardId: string): Promise<SavedCard | null> {
    return await prisma.savedCard.findFirst({ where: { id: savedCardId, userId } });
  }

  async updateStatus(id: string, data: UpdateStatusInput): Promise<SavedCard> {
    return await prisma.savedCard.update({
      where: { id },
      data,
    });
  }

  async delete(id: string): Promise<SavedCard> {
    return await prisma.savedCard.delete({ where: { id } });
  }
}

export default new SavedCardRepository();
