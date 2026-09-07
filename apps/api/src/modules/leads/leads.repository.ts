import { prisma } from '../../lib/prisma.js';
import type { Prisma, LeadStatus } from '@prisma/client';

export const LeadsRepository = {
  findManyByTenant(tenantId: string, owner: { assignedUserId?: string } = {}) {
    return prisma.lead.findMany({ where: { tenantId, ...owner }, orderBy: { createdAt: 'desc' } });
  },

  findByIdAndTenant(id: string, tenantId: string, owner: { assignedUserId?: string } = {}) {
    return prisma.lead.findFirst({ where: { id, tenantId, ...owner } });
  },

  create(data: Prisma.LeadUncheckedCreateInput) {
    return prisma.lead.create({ data });
  },

  updateByIdAndTenant(id: string, tenantId: string, data: Prisma.LeadUpdateInput) {
    return prisma.lead.updateMany({ where: { id, tenantId }, data });
  },

  updateStatus(id: string, tenantId: string, status: LeadStatus) {
    return prisma.lead.updateMany({ where: { id, tenantId }, data: { status } });
  },

  markConverted(id: string, tenantId: string, companyId: string, client: Prisma.TransactionClient = prisma) {
    return client.lead.updateMany({
      where: { id, tenantId, status: { not: 'CONVERTED' } },
      data: { status: 'CONVERTED', convertedCompanyId: companyId, convertedAt: new Date() },
    });
  },
};
