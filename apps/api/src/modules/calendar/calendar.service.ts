import type { CalendarEventDTO } from '@roult/shared';
import { prisma } from '../../lib/prisma.js';
import { ownerFilter, type Actor } from '../../lib/scope.js';

// El rango llega como "YYYY-MM-DD" y las fechas se guardan como medianoche UTC, así que el límite
// superior se corre un día para que "hasta el 30" incluya todo el día 30.
function dayStart(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}
function dayAfter(date: string): Date {
  return new Date(dayStart(date).getTime() + 86_400_000);
}
function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export const CalendarService = {
  async range(actor: Actor, from: string, to: string): Promise<CalendarEventDTO[]> {
    const { tenantId } = actor;
    const owner = ownerFilter(actor);
    // Una tarea se scopea por ownerId; un deal por assignedUserId. Son dos ejes distintos y mezclarlos
    // le mostraría a un vendedor los pasos de ventas que no son suyas.
    const taskOwner = actor.role === 'ADMIN' ? {} : { ownerId: actor.userId };
    const window = { gte: dayStart(from), lt: dayAfter(to) };

    const [tasks, nextSteps, closings] = await Promise.all([
      prisma.task.findMany({
        where: { tenantId, ...taskOwner, dueDate: window },
        select: { id: true, title: true, description: true, dueDate: true, dueTime: true, status: true, ownerId: true },
      }),
      prisma.deal.findMany({
        where: { tenantId, ...owner, nextStepDate: window },
        select: {
          id: true,
          title: true,
          nextStepDescription: true,
          nextStepDate: true,
          assignedUserId: true,
          company: { select: { name: true } },
        },
      }),
      prisma.deal.findMany({
        where: { tenantId, ...owner, expectedCloseDate: window },
        select: {
          id: true,
          title: true,
          expectedCloseDate: true,
          assignedUserId: true,
          company: { select: { name: true } },
        },
      }),
    ]);

    const events: CalendarEventDTO[] = [
      ...tasks.map((task) => ({
        id: task.id,
        source: 'TASK' as const,
        title: task.title,
        subtitle: task.description,
        date: isoDate(task.dueDate),
        time: task.dueTime,
        ownerId: task.ownerId,
        done: task.status === 'DONE',
      })),
      ...nextSteps.map((deal) => ({
        id: deal.id,
        source: 'DEAL_NEXT_STEP' as const,
        title: deal.nextStepDescription ?? `Próximo paso · ${deal.title}`,
        subtitle: deal.company.name,
        date: isoDate(deal.nextStepDate!),
        // Un deal no tiene hora: su paso ocupa el día entero.
        time: null,
        ownerId: deal.assignedUserId,
        done: false,
      })),
      ...closings.map((deal) => ({
        id: deal.id,
        source: 'DEAL_CLOSE' as const,
        title: `Cierre estimado · ${deal.title}`,
        subtitle: deal.company.name,
        date: isoDate(deal.expectedCloseDate!),
        time: null,
        ownerId: deal.assignedUserId,
        done: false,
      })),
    ];

    // Ordenado por día y, dentro del día, por hora. Los de todo el día van primero: es el orden en
    // que la vista los dibuja, y así el cliente no tiene que reordenar nada.
    return events.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? ''));
  },
};
