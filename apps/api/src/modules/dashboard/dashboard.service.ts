import { DEAL_STAGE_GROUPS, type DashboardDTO, type MoneyByCurrency } from '@ventry/shared';
import type { DealStage } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { ownerFilter, type Actor } from '../../lib/scope.js';

// El día de hoy según el calendario del usuario del servidor, expresado como la medianoche UTC con
// la que se guardan las fechas de vencimiento. Mismo criterio que apps/web/src/lib/date.ts.
function todayAsUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

async function amountByCurrency(
  tenantId: string,
  owner: { assignedUserId?: string },
  stages: readonly string[]
): Promise<MoneyByCurrency> {
  const grouped = await prisma.deal.groupBy({
    by: ['currency'],
    where: { tenantId, ...owner, stage: { in: stages as DealStage[] } },
    _sum: { amount: true },
  });
  // PEN y USD nunca se suman entre sí (spec de negocio, sección 21): se devuelven como dos totales
  // separados, y una moneda sin deals da '0', no null.
  const total = { PEN: '0', USD: '0' };
  for (const row of grouped) {
    total[row.currency] = (row._sum.amount ?? 0).toString();
  }
  return total;
}

export const DashboardService = {
  async summary(actor: Actor): Promise<DashboardDTO> {
    const { tenantId } = actor;
    const owner = ownerFilter(actor);
    const today = todayAsUTC();
    // Una tarea es del usuario por ownerId, no por assignedUserId, así que su filtro es propio.
    const taskOwner = actor.role === 'ADMIN' ? {} : { ownerId: actor.userId };

    const [leadsNew, dealsActive, dealsWon, dealsLost, clientsActive, tasksUpcoming, tasksOverdue, wonAmount, activeAmount] =
      await Promise.all([
        prisma.lead.count({ where: { tenantId, ...owner, status: 'NEW' } }),
        prisma.deal.count({ where: { tenantId, ...owner, stage: { in: DEAL_STAGE_GROUPS.active as unknown as DealStage[] } } }),
        prisma.deal.count({ where: { tenantId, ...owner, stage: { in: DEAL_STAGE_GROUPS.won as unknown as DealStage[] } } }),
        prisma.deal.count({ where: { tenantId, ...owner, stage: { in: DEAL_STAGE_GROUPS.lost as unknown as DealStage[] } } }),
        prisma.company.count({ where: { tenantId, ...owner } }),
        prisma.task.count({ where: { tenantId, ...taskOwner, status: { not: 'DONE' }, dueDate: { gte: today } } }),
        prisma.task.count({ where: { tenantId, ...taskOwner, status: { not: 'DONE' }, dueDate: { lt: today } } }),
        amountByCurrency(tenantId, owner, DEAL_STAGE_GROUPS.won),
        amountByCurrency(tenantId, owner, DEAL_STAGE_GROUPS.active),
      ]);

    return {
      leadsNew,
      dealsActive,
      dealsWon,
      dealsLost,
      wonAmount,
      activeAmount,
      clientsActive,
      tasksUpcoming,
      tasksOverdue,
    };
  },
};
