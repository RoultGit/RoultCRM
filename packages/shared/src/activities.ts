import { z } from 'zod';
import { relatedTypeSchema } from './tasks.js';

export const activityTypeSchema = z.enum(['NOTE', 'CALL', 'MEETING', 'WHATSAPP', 'EMAIL', 'VISIT']);
export type ActivityType = z.infer<typeof activityTypeSchema>;

export const ACTIVITY_LABEL: Record<ActivityType, string> = {
  NOTE: 'Nota',
  CALL: 'Llamada',
  MEETING: 'Reunión',
  WHATSAPP: 'WhatsApp',
  EMAIL: 'Correo',
  VISIT: 'Visita',
};

export const ACTIVITY_OPTIONS = (Object.keys(ACTIVITY_LABEL) as ActivityType[]).map((value) => ({
  value,
  label: ACTIVITY_LABEL[value],
}));

export const createActivitySchema = z.object({
  relatedType: relatedTypeSchema,
  relatedId: z.string().min(1),
  type: activityTypeSchema,
  body: z.string().min(1, 'Contá qué pasó'),
  // Opcional: si no viene, es ahora. Una llamada del viernes se anota el lunes, y sin poder
  // corregir la fecha la historia queda contada en el orden equivocado.
  occurredAt: z.string().datetime().optional(),
});

export const activityFiltersSchema = z.object({
  relatedType: relatedTypeSchema,
  relatedId: z.string().min(1),
});

export interface ActivityDTO {
  id: string;
  authorId: string;
  relatedType: z.infer<typeof relatedTypeSchema>;
  relatedId: string;
  type: ActivityType;
  body: string;
  occurredAt: string;
  createdAt: string;
}
