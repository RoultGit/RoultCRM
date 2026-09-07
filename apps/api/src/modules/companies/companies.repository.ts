import { prisma } from '../../lib/prisma.js';
import type { Prisma, Line } from '@prisma/client';

export interface CompanyFilters {
  assignedUserId?: string;
  line?: Line;
}

export const CompaniesRepository = {
  findManyByTenant(tenantId: string, owner: { assignedUserId?: string } = {}, filters: CompanyFilters = {}) {
    return prisma.company.findMany({
      where: {
        tenantId,
        ...owner,
        ...(filters.assignedUserId ? { assignedUserId: filters.assignedUserId } : {}),
        ...(filters.line ? { line: filters.line } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  findByIdAndTenant(id: string, tenantId: string, owner: { assignedUserId?: string } = {}) {
    return prisma.company.findFirst({ where: { id, tenantId, ...owner } });
  },

  findPossibleDuplicate(
    tenantId: string,
    criteria: { name: string; email?: string; whatsapp?: string },
    excludeId?: string
  ) {
    const or: Prisma.CompanyWhereInput[] = [{ name: { equals: criteria.name, mode: 'insensitive' } }];
    if (criteria.email) or.push({ email: criteria.email });
    if (criteria.whatsapp) or.push({ whatsapp: criteria.whatsapp });
    return prisma.company.findFirst({
      where: { tenantId, OR: or, ...(excludeId ? { id: { not: excludeId } } : {}) },
    });
  },

  create(data: Prisma.CompanyUncheckedCreateInput, client: Prisma.TransactionClient = prisma) {
    return client.company.create({ data });
  },

  updateByIdAndTenant(id: string, tenantId: string, data: Prisma.CompanyUpdateInput) {
    return prisma.company.updateMany({ where: { id, tenantId }, data });
  },
};
