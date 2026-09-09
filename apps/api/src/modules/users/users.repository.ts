import { prisma } from '../../lib/prisma.js';
import type { Prisma, UserStatus } from '@prisma/client';

export const UsersRepository = {
  findManyByTenant(tenantId: string, filters: { status?: UserStatus } = {}) {
    return prisma.user.findMany({
      where: { tenantId, ...(filters.status ? { status: filters.status } : {}) },
      orderBy: { createdAt: 'asc' },
    });
  },

  findByIdAndTenant(id: string, tenantId: string) {
    return prisma.user.findFirst({ where: { id, tenantId } });
  },

  create(data: Prisma.UserUncheckedCreateInput) {
    return prisma.user.create({ data });
  },

  updateByIdAndTenant(id: string, tenantId: string, data: Prisma.UserUpdateInput) {
    return prisma.user.updateMany({ where: { id, tenantId }, data });
  },

  // Método propio y no updateByIdAndTenant: las credenciales no pueden viajar por el mismo camino
  // que nombre y teléfono, donde un spread del body podría arrastrar un passwordHash puesto a mano.
  updateCredentials(
    id: string,
    tenantId: string,
    data: { passwordHash: string; mustChangePassword: boolean }
  ) {
    return prisma.user.updateMany({ where: { id, tenantId }, data });
  },

  updateStatus(id: string, tenantId: string, status: UserStatus) {
    return prisma.user.updateMany({ where: { id, tenantId }, data: { status } });
  },
};
