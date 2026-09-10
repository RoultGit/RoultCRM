import { z } from 'zod';
import { optionalText } from './common.js';

export const relatedTypeSchema = z.enum(['LEAD', 'COMPANY', 'DEAL', 'CONTACT']);

// Tres estados en vez de un booleano: son las columnas del tablero. "En curso" es lo que faltaba —
// con un checkbox no había forma de decir "esto lo estoy haciendo", y todo lo empezado se veía
// igual que lo que ni se tocó.
export const taskStatusSchema = z.enum(['TODO', 'DOING', 'DONE']);

export const taskPrioritySchema = z.enum(['URGENT', 'HIGH', 'MEDIUM', 'LOW']);
export type TaskPriority = z.infer<typeof taskPrioritySchema>;

export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  URGENT: 'Urgente',
  HIGH: 'Alta',
  MEDIUM: 'Media',
  LOW: 'Baja',
};

// De lo más urgente a lo menos, igual que el enum en la base.
export const PRIORITY_OPTIONS = (Object.keys(PRIORITY_LABEL) as TaskPriority[]).map((value) => ({
  value,
  label: PRIORITY_LABEL[value],
}));

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
  priority: taskPrioritySchema.optional(),
});

export const updateTaskSchema = createTaskSchema.partial();

export const taskFiltersSchema = z.object({
  status: optionalText(taskStatusSchema),
  priority: optionalText(taskPrioritySchema),
  ownerId: optionalText(z.string()),
});

// Registrar un avance: qué se hizo y en cuánto quedó. La nota es obligatoria — un avance sin
// explicación es el mismo número suelto que este historial vino a reemplazar.
export const createTaskUpdateSchema = z.object({
  note: z.string().min(1, 'Contá qué avanzaste'),
  progress: progressSchema,
});

export interface TaskUpdateDTO {
  id: string;
  taskId: string;
  authorId: string;
  note: string;
  progress: number;
  createdAt: string;
}

export interface TaskDTO {
  id: string;
  title: string;
  description: string | null;
  ownerId: string;
  relatedType: 'LEAD' | 'COMPANY' | 'DEAL' | 'CONTACT' | null;
  relatedId: string | null;
  dueDate: string;
  dueTime: string | null;
  status: 'TODO' | 'DOING' | 'DONE';
  priority: TaskPriority;
  progress: number;
  // null en las tareas anteriores a que se registrara la autoría: no se sabe quién las creó.
  createdById: string | null;
  // Se llenan al cerrar la tarea y se limpian al reabrirla.
  completedById: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
