import { z } from 'zod';
import { optionalText } from './common.js';

export const relatedTypeSchema = z.enum(['LEAD', 'COMPANY', 'DEAL']);

// Tres estados en vez de un booleano: son las columnas del tablero. "En curso" es lo que faltaba —
// con un checkbox no había forma de decir "esto lo estoy haciendo", y todo lo empezado se veía
// igual que lo que ni se tocó.
export const taskStatusSchema = z.enum(['TODO', 'DOING', 'DONE']);

// "HH:mm" en 24h. Vacío es una tarea de todo el día, que en el calendario va a la fila de arriba en
// vez de a una hora concreta.
export const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Usa el formato HH:mm, por ejemplo 09:30');

// Avance de 0 a 100. coerce porque el <input type="number"> entrega string y sin esto todo avance
// escrito a mano se rechazaba como "no es un número".
export const progressSchema = z.coerce
  .number({ invalid_type_error: 'El avance tiene que ser un número' })
  .int('El avance va en números enteros')
  .min(0, 'El avance no puede ser negativo')
  .max(100, 'El avance no puede pasar de 100');

export const createTaskSchema = z.object({
  title: z.string().min(1, 'Ingresa el título de la tarea'),
  description: optionalText(z.string()),
  ownerId: optionalText(z.string()),
  relatedType: relatedTypeSchema.optional(),
  relatedId: optionalText(z.string()),
  dueDate: z.string().date('Ingresa una fecha válida'),
  dueTime: optionalText(timeSchema),
  status: taskStatusSchema.optional(),
  progress: progressSchema.optional(),
});

export const updateTaskSchema = createTaskSchema.partial();

export const taskFiltersSchema = z.object({
  status: optionalText(taskStatusSchema),
  ownerId: optionalText(z.string()),
});

export interface TaskDTO {
  id: string;
  title: string;
  description: string | null;
  ownerId: string;
  relatedType: 'LEAD' | 'COMPANY' | 'DEAL' | null;
  relatedId: string | null;
  dueDate: string;
  dueTime: string | null;
  status: 'TODO' | 'DOING' | 'DONE';
  progress: number;
  createdAt: string;
  updatedAt: string;
}
