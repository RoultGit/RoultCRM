import { prisma } from '../../lib/prisma.js';
import type { Prisma } from '@prisma/client';

const withCompanyName = { include: { company: { select: { name: true } } } } as const;

// La visibilidad de un contacto la decide el dueño de su empresa, no el contacto en sí.
const withCompanyOwner = { include: { company: { select: { name: true, assignedUserId: true } } } } as const;

/** El contacto no tiene dueño propio: hereda el de su empresa, que es de quien depende. */
function buildWhere(tenantId: string, owner: { assignedUserId?: string }, companyId?: string) {
  return {
    tenantId,
    ...(companyId ? { companyId } : {}),
    ...(owner.assignedUserId ? { company: { assignedUserId: owner.assignedUserId } } : {}),
  };
}

export const ContactsRepository = {
  /** La página y el total, de la misma consulta. */
  async findPageByTenant(
    tenantId: string,
    owner: { assignedUserId?: string } = {},
    page: { take: number; skip: number } = { take: 50, skip: 0 },
    companyId?: string
  ) {
    const where = buildWhere(tenantId, owner, companyId);
    const [items, total] = await prisma.$transaction([
      prisma.contact.findMany({ where, orderBy: { createdAt: 'desc' }, ...withCompanyName, ...page }),
      prisma.contact.count({ where }),
    ]);
    return { items, total };
  },

  findManyByTenant(tenantId: string, owner: { assignedUserId?: string } = {}, page?: { take: number; skip: number }) {
    return prisma.contact.findMany({
      where: buildWhere(tenantId, owner),
      orderBy: { createdAt: 'desc' },
      ...withCompanyName,
      ...(page ?? {}),
    });
  },

  findByIdAndTenant(id: string, tenantId: string, owner: { assignedUserId?: string } = {}) {
    return prisma.contact.findFirst({
      where: { id, tenantId, ...(owner.assignedUserId ? { company: { assignedUserId: owner.assignedUserId } } : {}) },
      ...withCompanyName,
    });
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
      ...withCompanyOwner,
    });
  },

  create(data: Prisma.ContactUncheckedCreateInput, client: Prisma.TransactionClient = prisma) {
    return client.contact.create({ data, ...withCompanyName });
  },

  updateByIdAndTenant(id: string, tenantId: string, data: Prisma.ContactUpdateInput) {
    return prisma.contact.updateMany({ where: { id, tenantId }, data });
  },
};
