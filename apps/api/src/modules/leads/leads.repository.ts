import { prisma } from '../../lib/prisma.js';
import type { Prisma, LeadStatus, Line, BillingType } from '@prisma/client';

export interface LeadFilters {
  status?: LeadStatus;
  assignedUserId?: string;
  line?: Line;
  billingType?: BillingType;
  source?: string;
}

/** El `where` se arma una sola vez y lo usan la página y el conteo: si se escribieran por separado
 *  el total podría contar filas que la página no devuelve. */
function buildWhere(tenantId: string, owner: { assignedUserId?: string }, filters: LeadFilters) {
  return {
        tenantId,
        // El scoping por dueño y el filtro del query van en AND, NUNCA como dos spreads en el
        // mismo objeto: ahí el último gana, y `?assignedUserId=<otro>` pisaba el scoping y le
        // devolvía a un vendedor la cartera de un colega. Intersecándolos, un vendedor que filtre
        // por otro dueño obtiene cero filas, que es la respuesta correcta.
        AND: [owner, {
          ...(filters.status ? { status: filters.status } : {}),
          ...(filters.assignedUserId ? { assignedUserId: filters.assignedUserId } : {}),
          ...(filters.line ? { line: filters.line } : {}),
          ...(filters.billingType ? { billingType: filters.billingType } : {}),
          // El origen se escribe a mano, así que se busca por coincidencia parcial y sin distinguir
          // mayúsculas: "Instagram", "instagram" y "IG - Instagram" caen en el mismo filtro.
          ...(filters.source ? { source: { contains: filters.source, mode: 'insensitive' as const } } : {}),
        }],
  } satisfies Prisma.LeadWhereInput;
}

export const LeadsRepository = {
  findManyByTenant(
    tenantId: string,
    owner: { assignedUserId?: string } = {},
    filters: LeadFilters = {},
    page?: { take: number; skip: number }
  ) {
    return prisma.lead.findMany({
      where: buildWhere(tenantId, owner, filters),
      orderBy: { createdAt: 'desc' },
      ...(page ?? {}),
    });
  },

  countByTenant(tenantId: string, owner: { assignedUserId?: string } = {}, filters: LeadFilters = {}) {
    return prisma.lead.count({ where: buildWhere(tenantId, owner, filters) });
  },

  findByIdAndTenant(id: string, tenantId: string, owner: { assignedUserId?: string } = {}) {
    return prisma.lead.findFirst({ where: { id, tenantId, ...owner } });
  },

  create(data: Prisma.LeadUncheckedCreateInput, client: Prisma.TransactionClient = prisma) {
    return client.lead.create({ data });
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
