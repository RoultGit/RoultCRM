import { prisma } from '../../lib/prisma.js';
import type { Prisma } from '@prisma/client';

export const TasksRepository = {
  /** La página y el total, de la misma consulta. */
  async findPageByTenant(
    tenantId: string,
    owner: { ownerId?: string } = {},
    page: { take: number; skip: number } = { take: 50, skip: 0 }
  ) {
    const where = { tenantId, ...owner };
    const [items, total] = await prisma.$transaction([
      prisma.task.findMany({
        where,
        // Prioridad antes que fecha, igual que el listado completo: lo urgente sube aunque venza
        // más tarde, que es la razón de tener prioridades.
        orderBy: [{ status: 'asc' }, { priority: 'asc' }, { dueDate: 'asc' }, { dueTime: 'asc' }],
        ...page,
      }),
      prisma.task.count({ where }),
    ]);
    return { items, total };
  },

  // El orden es el que quiere la vista "Mi día": lo pendiente primero, y dentro de eso lo más
  // vencido arriba. El enum TaskStatus está declarado TODO, DOING, DONE justamente para que ese
  // orden alfabético... no sirva: Postgres ordena los enum por su orden de declaración, no
  // alfabético, así que 'asc' da TODO → DOING → DONE, que es el orden de las columnas.
  findManyByTenant(tenantId: string, owner: { ownerId?: string } = {}, page?: { take: number; skip: number }) {
    return prisma.task.findMany({
      where: { tenantId, ...owner },
      ...(page ?? {}),
      // Prioridad antes que fecha: lo urgente sube aunque venza más tarde, que es la razón de
      // tener prioridades.
      orderBy: [{ status: 'asc' }, { priority: 'asc' }, { dueDate: 'asc' }, { dueTime: 'asc' }],
    });
  },

  findByIdAndTenant(id: string, tenantId: string, owner: { ownerId?: string } = {}) {
    return prisma.task.findFirst({ where: { id, tenantId, ...owner } });
  },

  create(data: Prisma.TaskUncheckedCreateInput) {
    return prisma.task.create({ data });
  },

  updateByIdAndTenant(id: string, tenantId: string, data: Prisma.TaskUpdateInput) {
    return prisma.task.updateMany({ where: { id, tenantId }, data });
  },

  findUpdates(taskId: string, tenantId: string) {
    // Del más nuevo al más viejo: lo último que pasó es lo que se quiere leer primero.
    return prisma.taskUpdate.findMany({
      where: { taskId, tenantId },
      orderBy: { createdAt: 'desc' },
    });
  },

  /**
   * Registra un avance y deja el progreso de la tarea en ese valor, en una transacción.
   *
   * Los dos escritos van juntos porque son el mismo hecho: si se guardara el avance y fallara la
   * tarea, la barra mostraría un número que ningún registro respalda; y al revés, la tarea diría
   * 70% sin que exista el avance que lo explica.
   */
  addUpdate(data: Prisma.TaskUpdateUncheckedCreateInput) {
    return prisma.$transaction(async (tx) => {
      const update = await tx.taskUpdate.create({ data });
      await tx.task.updateMany({
        where: { id: data.taskId, tenantId: data.tenantId },
        data: { progress: data.progress },
      });
      return update;
    });
  },
};
