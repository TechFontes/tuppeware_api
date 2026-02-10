import prisma from '../config/database';
import type { Prisma } from '../../generated/prisma/client';

class PasswordResetRepository {
  async create(data: Prisma.PasswordResetUncheckedCreateInput) {
    return await prisma.passwordReset.create({ data });
  }

  async findByToken(token: string) {
    return await prisma.passwordReset.findUnique({
      where: { token },
      include: { user: true },
    });
  }

  async markAsUsed(id: string) {
    return await prisma.passwordReset.update({
      where: { id },
      data: { used: true },
    });
  }

  async deleteExpired() {
    return await prisma.passwordReset.deleteMany({
      where: {
        OR: [{ expiresAt: { lt: new Date() } }, { used: true }],
      },
    });
  }

  async invalidateAllForUser(userId: string) {
    return await prisma.passwordReset.updateMany({
      where: { userId, used: false },
      data: { used: true },
    });
  }
}

export default new PasswordResetRepository();
