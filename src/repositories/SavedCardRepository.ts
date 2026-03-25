import prisma from '../config/database';
import type { SavedCard, Prisma } from '../../generated/prisma/client';

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

  async findByToken(token: string): Promise<SavedCard | null> {
    return await prisma.savedCard.findUnique({ where: { token } });
  }

  async delete(id: string): Promise<SavedCard> {
    return await prisma.savedCard.delete({ where: { id } });
  }
}

export default new SavedCardRepository();
