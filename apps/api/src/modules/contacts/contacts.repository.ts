import { prisma } from '../../lib/prisma.js';
import type { Prisma } from '@prisma/client';

const withCompanyName = { include: { company: { select: { name: true } } } } as const;

export const ContactsRepository = {
  findManyByTenant(tenantId: string) {
    return prisma.contact.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, ...withCompanyName });
  },

  findByIdAndTenant(id: string, tenantId: string) {
    return prisma.contact.findFirst({ where: { id, tenantId }, ...withCompanyName });
  },

  findPossibleDuplicate(
    tenantId: string,
    criteria: { companyId: string; name: string; email?: string; phone?: string; whatsapp?: string },
    excludeId?: string
  ) {
    const or: Prisma.ContactWhereInput[] = [
      { companyId: criteria.companyId, name: { equals: criteria.name, mode: 'insensitive' } },
    ];
    if (criteria.email) or.push({ email: criteria.email });
    if (criteria.phone) or.push({ phone: criteria.phone });
    if (criteria.whatsapp) or.push({ whatsapp: criteria.whatsapp });
    return prisma.contact.findFirst({
      where: { tenantId, OR: or, ...(excludeId ? { id: { not: excludeId } } : {}) },
      ...withCompanyName,
    });
  },

  create(data: Prisma.ContactUncheckedCreateInput) {
    return prisma.contact.create({ data, ...withCompanyName });
  },

  updateByIdAndTenant(id: string, tenantId: string, data: Prisma.ContactUpdateInput) {
    return prisma.contact.updateMany({ where: { id, tenantId }, data });
  },
};
