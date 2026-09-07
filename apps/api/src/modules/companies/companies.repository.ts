import { prisma } from '../../lib/prisma.js';
import type { Prisma } from '@prisma/client';

export const CompaniesRepository = {
  findManyByTenant(tenantId: string, owner: { assignedUserId?: string } = {}) {
    return prisma.company.findMany({ where: { tenantId, ...owner }, orderBy: { createdAt: 'desc' } });
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
