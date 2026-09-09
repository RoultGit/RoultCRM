import type { TaskDTO, createTaskSchema, updateTaskSchema } from '@roult/shared';
import type { z } from 'zod';
import type { Task } from '@prisma/client';
import { TasksRepository } from './tasks.repository.js';
import { UsersRepository } from '../users/users.repository.js';
import { NotFoundError } from '../../lib/errors.js';
import type { Actor } from '../../lib/scope.js';

export function toDTO(task: Task): TaskDTO {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    ownerId: task.ownerId,
    relatedType: task.relatedType,
    relatedId: task.relatedId,
    dueDate: task.dueDate.toISOString(),
    dueTime: task.dueTime,
    status: task.status,
    priority: task.priority,
    progress: task.progress,
    createdById: task.createdById,
    completedById: task.completedById,
    completedAt: task.completedAt?.toISOString() ?? null,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

// Una Task se scopea por ownerId, no por assignedUserId, así que ownerFilter no aplica acá.
function taskOwnerFilter(actor: Actor): { ownerId?: string } {
  return actor.role === 'ADMIN' ? {} : { ownerId: actor.userId };
}

export const TasksService = {
  async list(actor: Actor): Promise<TaskDTO[]> {
    const tasks = await TasksRepository.findManyByTenant(actor.tenantId, taskOwnerFilter(actor));
    return tasks.map(toDTO);
  },

  // El tablero mueve tareas de columna arrastrando, igual que el pipeline. Es el mismo update, pero
  // con su propia ruta para que el frontend pueda hacerlo optimista sin mandar el resto del form.
  async setStatus(actor: Actor, id: string, status: TaskDTO['status']): Promise<TaskDTO> {
    const existing = await TasksRepository.findByIdAndTenant(id, actor.tenantId, taskOwnerFilter(actor));
    if (!existing) throw new NotFoundError('Task not found');
    // Cerrar la tarea lleva el avance a 100. Una tarjeta que dice "Hecha" con la barra al 40% es
    // una contradicción que el que la mira tiene que resolver de memoria.
    await TasksRepository.updateByIdAndTenant(id, actor.tenantId, {
      status,
      ...(status === 'DONE'
        ? { progress: 100, completedById: actor.userId, completedAt: new Date() }
        : // Reabrir limpia el cierre. Si no, una tarea en "Por hacer" seguiría diciendo
          // "completada por Ana el 3 de marzo", que es peor que no decir nada.
          { completedById: null, completedAt: null }),
    });
    const updated = await TasksRepository.findByIdAndTenant(id, actor.tenantId);
    return toDTO(updated!);
  },

  async create(actor: Actor, input: z.infer<typeof createTaskSchema>): Promise<TaskDTO> {
    const ownerId = actor.role === 'ADMIN' ? (input.ownerId ?? actor.userId) : actor.userId;
    if (ownerId !== actor.userId) {
      const owner = await UsersRepository.findByIdAndTenant(ownerId, actor.tenantId);
      if (!owner) throw new NotFoundError('Task owner not found');
    }

    const task = await TasksRepository.create({
      tenantId: actor.tenantId,
      title: input.title,
      description: input.description,
      ownerId,
      relatedType: input.relatedType,
      relatedId: input.relatedId,
      dueDate: new Date(input.dueDate),
      dueTime: input.dueTime,
      status: input.status,
      priority: input.priority,
      progress: input.progress,
      // Quién la creó es el actor, NUNCA algo que mande el cliente: si viniera del body, cualquiera
      // podría atribuirle a otro una tarea que él cargó.
      createdById: actor.userId,
      ...(input.status === 'DONE' ? { completedById: actor.userId, completedAt: new Date() } : {}),
    });
    return toDTO(task);
  },

  // Reasignar el dueño de una tarea existente queda fuera de alcance: update ignora ownerId a
  // propósito. Una tarea mal asignada se cierra y se crea de nuevo.
  async update(actor: Actor, id: string, input: z.infer<typeof updateTaskSchema>): Promise<TaskDTO> {
    const existing = await TasksRepository.findByIdAndTenant(id, actor.tenantId, taskOwnerFilter(actor));
    if (!existing) throw new NotFoundError('Task not found');

    await TasksRepository.updateByIdAndTenant(id, actor.tenantId, {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.dueDate !== undefined ? { dueDate: new Date(input.dueDate) } : {}),
      ...(input.dueTime !== undefined ? { dueTime: input.dueTime ?? null } : {}),
      // Cerrar por el formulario de edición registra el cierre igual que arrastrando al tablero:
      // el dato no puede depender de por dónde entró el cambio.
      ...(input.status !== undefined
        ? input.status === 'DONE'
          ? { status: input.status, completedById: actor.userId, completedAt: new Date() }
          : { status: input.status, completedById: null, completedAt: null }
        : {}),
      ...(input.progress !== undefined ? { progress: input.progress } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
    });
    const updated = await TasksRepository.findByIdAndTenant(id, actor.tenantId);
    return toDTO(updated!);
  },
};
