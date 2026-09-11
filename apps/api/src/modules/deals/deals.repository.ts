import { prisma } from '../../lib/prisma.js';
import type { Prisma, DealStage, Currency, Line, BillingType } from '@prisma/client';

export interface DealFilters {
  companyId?: string;
  stage?: DealStage;
  assignedUserId?: string;
  currency?: Currency;
  billingType?: BillingType;
  line?: Line;
  from?: string;
  to?: string;
}

const withCompany = { include: { company: { select: { name: true } } } } as const;

/** El `where` se arma una sola vez y lo usan la página y el conteo: escritos por separado, el
 *  total terminaría contando filas que la página no devuelve. */
function buildWhere(tenantId: string, owner: { assignedUserId?: string }, filters: DealFilters = {}) {
  return {
        tenantId,
        // El scoping por dueño y el filtro del query van en AND, NUNCA como dos spreads en el
        // mismo objeto: ahí el último gana, y `?assignedUserId=<otro>` pisaba el scoping y le
        // devolvía a un vendedor la cartera de un colega. Intersecándolos, un vendedor que filtre
        // por otro dueño obtiene cero filas, que es la respuesta correcta.
        AND: [owner, {
          ...(filters.companyId ? { companyId: filters.companyId } : {}),
          ...(filters.stage ? { stage: filters.stage } : {}),
          ...(filters.assignedUserId ? { assignedUserId: filters.assignedUserId } : {}),
          ...(filters.currency ? { currency: filters.currency } : {}),
          ...(filters.billingType ? { billingType: filters.billingType } : {}),
          // Deal no tiene línea propia: la hereda de su empresa.
          ...(filters.line ? { company: { line: filters.line } } : {}),
          ...(filters.from || filters.to
            ? {
                createdAt: {
                  ...(filters.from ? { gte: new Date(filters.from) } : {}),
                  // `to` es inclusivo para el usuario: "hasta el 9" incluye todo el día 9.
                  ...(filters.to ? { lt: new Date(new Date(filters.to).getTime() + 86_400_000) } : {}),
                },
              }
            : {}),
        }],
      };
}

export const DealsRepository = {
  findManyByTenant(tenantId: string, owner: { assignedUserId?: string } = {}, filters: DealFilters = {}, page?: { take: number; skip: number }) {
    return prisma.deal.findMany({
      where: buildWhere(tenantId, owner, filters),
      orderBy: { createdAt: 'desc' },
      ...withCompany,
      ...(page ?? {}),
    });
  },

  /** La página y el total, de la misma consulta. */
  async findPageByTenant(
    tenantId: string,
    owner: { assignedUserId?: string } = {}, filters: DealFilters = {},
    page: { take: number; skip: number } = { take: 50, skip: 0 }
  ) {
    const where = buildWhere(tenantId, owner, filters);
    const [items, total] = await prisma.$transaction([
      prisma.deal.findMany({ where, orderBy: { createdAt: 'desc' }, ...withCompany, ...page }),
      prisma.deal.count({ where }),
    ]);
    return { items, total };
  },

  findByIdAndTenant(id: string, tenantId: string, owner: { assignedUserId?: string } = {}) {
    return prisma.deal.findFirst({ where: { id, tenantId, ...owner }, ...withCompany });
  },

  create(data: Prisma.DealUncheckedCreateInput, client: Prisma.TransactionClient = prisma) {
    return client.deal.create({ data, ...withCompany });
  },

  updateByIdAndTenant(id: string, tenantId: string, data: Prisma.DealUpdateInput) {
    return prisma.deal.updateMany({ where: { id, tenantId }, data });
  },

  // deleteMany y no delete: `where` acepta el tenantId, así que un id de otro tenant borra cero
  // filas en vez de borrar la fila ajena. El count que devuelve dice si existía.
  deleteByIdAndTenant(id: string, tenantId: string) {
    return prisma.deal.deleteMany({ where: { id, tenantId } });
  },

  recordAssignment(data: Prisma.AssignmentHistoryUncheckedCreateInput) {
    return prisma.assignmentHistory.create({ data });
  },
};
