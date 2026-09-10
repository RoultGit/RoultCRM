import { prisma } from '../../lib/prisma.js';

export const AuthRepository = {
  // findMany y no findUnique: el correo ya no es único en el mundo, así que un mismo correo puede
  // corresponder a varias personas en empresas distintas. Quién es cuál lo decide la contraseña.
  findUsersByEmail(email: string) {
    return prisma.user.findMany({
      where: { email },
      include: { tenant: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
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
  createPasswordReset(tenantId: string, userId: string, tokenHash: string, expiresAt: Date) {
    return prisma.passwordResetToken.create({ data: { tenantId, userId, tokenHash, expiresAt } });
  },

  /**
   * Marca el token como usado y devuelve si lo consiguió.
   *
   * updateMany con las condiciones ADENTRO del where, y no leer-después-escribir: así el propio
   * Postgres garantiza que dos pedidos simultáneos con el mismo token no lo consuman los dos. El
   * que llega segundo actualiza cero filas.
   */
  async consumePasswordReset(tokenHash: string) {
    const { count } = await prisma.passwordResetToken.updateMany({
      where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (count === 0) return null;
    return prisma.passwordResetToken.findUnique({ where: { tokenHash }, include: { user: true } });
  },

  // Al pedir un reseteo nuevo, los anteriores mueren: si no, cada pedido deja otro link vivo en la
  // bandeja de entrada y cualquiera de ellos sirve.
  invalidatePasswordResets(userId: string) {
    return prisma.passwordResetToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });
  },

  // Todas las cuentas con ese correo: si la persona está en dos empresas, tiene que poder recuperar
  // cualquiera de las dos, y desde afuera no hay forma de saber cuál olvidó.
  findUsersByEmailForReset(email: string) {
    return prisma.user.findMany({ where: { email, status: 'ACTIVE' } });
  },

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
