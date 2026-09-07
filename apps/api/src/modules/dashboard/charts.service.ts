import { DEAL_STAGE_GROUPS, type DashboardChartsDTO, type MonthPointDTO } from '@ventry/shared';
import type { DealStage } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { ownerFilter, type Actor } from '../../lib/scope.js';

// Los meses del gráfico se arman en UTC, igual que el resto de las fechas del sistema. Construirlos
// en hora local haría que en Lima (UTC-5) el deal creado el 1 a las 00:30 cayera en el mes anterior.
function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

// Los últimos N meses, del más viejo al más nuevo. Se listan completos aunque no tengan un solo
// deal: un mes ausente rompería el eje del gráfico y haría parecer que ese mes no existió.
function lastMonths(count: number): string[] {
  const now = new Date();
  const months: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    months.push(monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))));
  }
  return months;
}

function rangeStart(months: number): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1));
}

export const ChartsService = {
  async charts(actor: Actor, months: number): Promise<DashboardChartsDTO> {
    const { tenantId } = actor;
    const owner = ownerFilter(actor);
    const since = rangeStart(months);
    const isAdmin = actor.role === 'ADMIN';

    const [stageRows, dealsInRange, leadRows, users] = await Promise.all([
      prisma.deal.groupBy({
        by: ['stage', 'currency'],
        where: { tenantId, ...owner },
        _count: { _all: true },
        _sum: { amount: true },
      }),
      // Se traen las columnas mínimas y se agrupa en memoria: son los deals de unos pocos meses de
      // un solo tenant, y agrupar por mes en SQL obligaría a raw query por el date_trunc.
      prisma.deal.findMany({
        where: { tenantId, ...owner, createdAt: { gte: since } },
        select: { createdAt: true, stage: true, amount: true, currency: true, assignedUserId: true },
      }),
      prisma.lead.groupBy({
        by: ['source'],
        where: { tenantId, ...owner },
        _count: { _all: true },
      }),
      isAdmin
        ? prisma.user.findMany({ where: { tenantId }, select: { id: true, firstName: true, lastName: true } })
        : Promise.resolve([]),
    ]);

    // ── pipeline por etapa ──────────────────────────────────────────────────────
    const byStage = new Map<string, { count: number; PEN: number; USD: number }>();
    for (const row of stageRows) {
      const slot = byStage.get(row.stage) ?? { count: 0, PEN: 0, USD: 0 };
      slot.count += row._count._all;
      slot[row.currency] += Number(row._sum.amount ?? 0);
      byStage.set(row.stage, slot);
    }
    const pipelineByStage = [...DEAL_STAGE_GROUPS.active, ...DEAL_STAGE_GROUPS.won, ...DEAL_STAGE_GROUPS.lost].map(
      (stage) => {
        const slot = byStage.get(stage) ?? { count: 0, PEN: 0, USD: 0 };
        return { stage, count: slot.count, amount: { PEN: String(slot.PEN), USD: String(slot.USD) } };
      }
    );

    // ── serie mensual ───────────────────────────────────────────────────────────
    const won = new Set<string>(DEAL_STAGE_GROUPS.won);
    const lost = new Set<string>(DEAL_STAGE_GROUPS.lost);
    const monthly = new Map<string, MonthPointDTO>(
      lastMonths(months).map((month) => [month, { month, created: 0, won: 0, lost: 0, wonAmountPEN: '0' }])
    );
    for (const deal of dealsInRange) {
      const point = monthly.get(monthKey(deal.createdAt));
      // Un deal fuera de los meses pedidos se ignora en vez de crear un mes suelto al final.
      if (!point) continue;
      point.created += 1;
      if (won.has(deal.stage)) {
        point.won += 1;
        // Solo PEN: sumar PEN con USD sería inventar un tipo de cambio (spec de negocio, sección 21).
        if (deal.currency === 'PEN') point.wonAmountPEN = String(Number(point.wonAmountPEN) + Number(deal.amount));
      }
      if (lost.has(deal.stage)) point.lost += 1;
    }

    // ── leads por origen ────────────────────────────────────────────────────────
    const leadsBySource = leadRows
      .map((row) => ({ source: row.source ?? 'Sin origen', count: row._count._all }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    // ── por vendedor (solo admin) ───────────────────────────────────────────────
    const activeStages = new Set<string>(DEAL_STAGE_GROUPS.active);
    const bySeller = users
      .map((user) => {
        const mine = dealsInRange.filter((d) => d.assignedUserId === user.id);
        const wonDeals = mine.filter((d) => won.has(d.stage));
        return {
          userId: user.id,
          name: `${user.firstName} ${user.lastName}`,
          active: mine.filter((d) => activeStages.has(d.stage)).length,
          won: wonDeals.length,
          wonAmountPEN: String(
            wonDeals.filter((d) => d.currency === 'PEN').reduce((sum, d) => sum + Number(d.amount), 0)
          ),
        };
      })
      .sort((a, b) => Number(b.wonAmountPEN) - Number(a.wonAmountPEN));

    return { pipelineByStage, monthly: [...monthly.values()], leadsBySource, bySeller };
  },
};
