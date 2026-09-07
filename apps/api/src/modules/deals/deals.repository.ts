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
        ...owner,
        ...(filters.stage ? { stage: filters.stage } : {}),
        // El filtro explícito se aplica encima del de scoping: un ADMIN puede pedir los deals de un
        // vendedor concreto, y a un VENDEDOR el `owner` ya lo dejó encerrado en los suyos igual.
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
      },
      orderBy: { createdAt: 'desc' },
      ...withCompany,
    });
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
