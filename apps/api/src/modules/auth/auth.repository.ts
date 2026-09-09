import { prisma } from '../../lib/prisma.js';

export const AuthRepository = {
  findUserByEmail(email: string) {
    return prisma.user.findUnique({ where: { email } });
  },

  storeRefreshToken(tenantId: string, userId: string, tokenHash: string, expiresAt: Date) {
    return prisma.refreshToken.create({ data: { tenantId, userId, tokenHash, expiresAt } });
  },

  // Atomically consumes a refresh token: the conditional WHERE (revokedAt: null)
  // means only one concurrent caller's UPDATE can match and flip the row, closing
  // the check-then-revoke TOCTOU race. Callers must branch on the returned count.
  consumeRefreshToken(tokenHash: string) {
    return prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null, expiresAt: { gt: new Date() } },
      data: { revokedAt: new Date() },
    });
  },

  findByTokenHash(tokenHash: string) {
    return prisma.refreshToken.findUnique({ where: { tokenHash }, include: { user: true } });
  },

  /**
   * Corta TODAS las sesiones abiertas de una persona.
   *
   * Es la mitad que importa de un cambio de contraseña. Sin esto, cambiarla no echa a nadie: quien
   * te robó la sesión sigue adentro con su refresh token, y la víctima cree que se protegió. Se
   * llama tanto al cambio propio como al reseteo del admin.
   */
  revokeAllForUser(userId: string) {
    return prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },

  revokeRefreshToken(tokenHash: string) {
    return prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },
};
