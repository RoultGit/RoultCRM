import { prisma } from '../../lib/prisma.js';
import type { Prisma } from '@prisma/client';

export const TasksRepository = {
  // El orden es el que quiere la vista "Mi día": lo pendiente primero, y dentro de eso lo más
  // vencido arriba. El enum TaskStatus está declarado TODO, DOING, DONE justamente para que ese
  // orden alfabético... no sirva: Postgres ordena los enum por su orden de declaración, no
  // alfabético, así que 'asc' da TODO → DOING → DONE, que es el orden de las columnas.
  findManyByTenant(tenantId: string, owner: { ownerId?: string } = {}) {
    return prisma.task.findMany({
      where: { tenantId, ...owner },
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
};
