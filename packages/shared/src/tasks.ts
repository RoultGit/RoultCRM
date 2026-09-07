import { z } from 'zod';
import { optionalText } from './common.js';

export const relatedTypeSchema = z.enum(['LEAD', 'COMPANY', 'DEAL']);

export const createTaskSchema = z.object({
  title: z.string().min(1, 'Ingresa el título de la tarea'),
  description: optionalText(z.string()),
  ownerId: optionalText(z.string()),
  relatedType: relatedTypeSchema.optional(),
  relatedId: optionalText(z.string()),
  dueDate: z.string().date('Ingresa una fecha válida'),
});

export const updateTaskSchema = createTaskSchema.partial().extend({
  done: z.boolean().optional(),
});

export interface TaskDTO {
  id: string;
  title: string;
  description: string | null;
  ownerId: string;
  relatedType: 'LEAD' | 'COMPANY' | 'DEAL' | null;
  relatedId: string | null;
  dueDate: string;
  done: boolean;
  createdAt: string;
  updatedAt: string;
}
