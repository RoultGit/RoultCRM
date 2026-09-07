import type { TaskDTO, createTaskSchema, updateTaskSchema } from '@ventry/shared';
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
    done: task.done,
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
      ...(input.done !== undefined ? { done: input.done } : {}),
    });
    const updated = await TasksRepository.findByIdAndTenant(id, actor.tenantId);
    return toDTO(updated!);
  },
};
