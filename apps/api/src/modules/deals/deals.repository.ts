import { prisma } from '../../lib/prisma.js';
import type { Prisma } from '@prisma/client';

const withCompany = { include: { company: { select: { name: true } } } } as const;

export const DealsRepository = {
  findManyByTenant(tenantId: string, owner: { assignedUserId?: string } = {}) {
    return prisma.deal.findMany({ where: { tenantId, ...owner }, orderBy: { createdAt: 'desc' }, ...withCompany });
  },

  findByIdAndTenant(id: string, tenantId: string, owner: { assignedUserId?: string } = {}) {
    return prisma.deal.findFirst({ where: { id, tenantId, ...owner }, ...withCompany });
  },

  create(data: Prisma.DealUncheckedCreateInput) {
    return prisma.deal.create({ data, ...withCompany });
  },

  updateByIdAndTenant(id: string, tenantId: string, data: Prisma.DealUpdateInput) {
    return prisma.deal.updateMany({ where: { id, tenantId }, data });
  },

  recordAssignment(data: Prisma.AssignmentHistoryUncheckedCreateInput) {
    return prisma.assignmentHistory.create({ data });
  },
};
