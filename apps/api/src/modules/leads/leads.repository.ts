import { prisma } from '../../lib/prisma.js';
import type { Prisma, LeadStatus, Line } from '@prisma/client';

export interface LeadFilters {
  status?: LeadStatus;
  assignedUserId?: string;
  line?: Line;
  source?: string;
}

export const LeadsRepository = {
  findManyByTenant(tenantId: string, owner: { assignedUserId?: string } = {}, filters: LeadFilters = {}) {
    return prisma.lead.findMany({
      where: {
        tenantId,
        ...owner,
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.assignedUserId ? { assignedUserId: filters.assignedUserId } : {}),
        ...(filters.line ? { line: filters.line } : {}),
        // El origen se escribe a mano, así que se busca por coincidencia parcial y sin distinguir
        // mayúsculas: "Instagram", "instagram" y "IG - Instagram" caen en el mismo filtro.
        ...(filters.source ? { source: { contains: filters.source, mode: 'insensitive' as const } } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
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
