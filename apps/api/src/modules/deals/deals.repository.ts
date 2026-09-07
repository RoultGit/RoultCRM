import { prisma } from '../../lib/prisma.js';
import type { Prisma, DealStage, Currency, Line } from '@prisma/client';

export interface DealFilters {
  stage?: DealStage;
  assignedUserId?: string;
  currency?: Currency;
  line?: Line;
  from?: string;
  to?: string;
}

const withCompany = { include: { company: { select: { name: true } } } } as const;

export const DealsRepository = {
  findManyByTenant(tenantId: string, owner: { assignedUserId?: string } = {}, filters: DealFilters = {}) {
    return prisma.deal.findMany({
      where: {
        tenantId,
        // El scoping por dueño y el filtro del query van en AND, NUNCA como dos spreads en el
        // mismo objeto: ahí el último gana, y `?assignedUserId=<otro>` pisaba el scoping y le
        // devolvía a un vendedor la cartera de un colega. Intersecándolos, un vendedor que filtre
        // por otro dueño obtiene cero filas, que es la respuesta correcta.
        AND: [owner, {
          ...(filters.stage ? { stage: filters.stage } : {}),
          ...(filters.assignedUserId ? { assignedUserId: filters.assignedUserId } : {}),
          ...(filters.currency ? { currency: filters.currency } : {}),
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
      },
      orderBy: { createdAt: 'desc' },
      ...withCompany,
    });
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
