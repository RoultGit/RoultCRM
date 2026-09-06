import { prisma } from '../../lib/prisma.js';
import type { Prisma, UserStatus } from '@prisma/client';

export const UsersRepository = {
  findManyByTenant(tenantId: string) {
    return prisma.user.findMany({ where: { tenantId }, orderBy: { createdAt: 'asc' } });
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

  updateStatus(id: string, tenantId: string, status: UserStatus) {
    return prisma.user.updateMany({ where: { id, tenantId }, data: { status } });
  },
};
