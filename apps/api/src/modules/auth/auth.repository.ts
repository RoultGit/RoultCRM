import { prisma } from '../../lib/prisma.js';

export const AuthRepository = {
  findUserByEmail(email: string) {
    return prisma.user.findUnique({ where: { email } });
  },

  storeRefreshToken(tenantId: string, userId: string, tokenHash: string, expiresAt: Date) {
    return prisma.refreshToken.create({ data: { tenantId, userId, tokenHash, expiresAt } });
  },

  findActiveRefreshToken(tokenHash: string) {
    return prisma.refreshToken.findFirst({
      where: { tokenHash, revokedAt: null, expiresAt: { gt: new Date() } },
      include: { user: true },
    });
  },

  revokeRefreshToken(tokenHash: string) {
    return prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },
};
