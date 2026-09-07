import { prisma } from '../../lib/prisma.js';
import type { Prisma } from '@prisma/client';

export const TasksRepository = {
  // El orden es el que quiere la vista "Mi día": lo pendiente primero, y dentro de eso lo más
  // vencido arriba.
  findManyByTenant(tenantId: string, owner: { ownerId?: string } = {}) {
    return prisma.task.findMany({
      where: { tenantId, ...owner },
      orderBy: [{ done: 'asc' }, { dueDate: 'asc' }],
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
