import { z } from 'zod';
import { currencySchema, moneySchema, optionalText } from './common.js';

export const dealStageSchema = z.enum([
  'CONTACTO',
  'PROPUESTA',
  'NEGOCIACION',
  'ADELANTO',
  'PRODUCCION',
  'ENTREGADO',
  'MANTENIMIENTO',
  'PERDIDO',
]);

export const createDealSchema = z.object({
  companyId: z.string().min(1, 'Selecciona una empresa'),
  title: z.string().min(1, 'Ingresa el título del deal'),
  amount: moneySchema,
  currency: currencySchema,
  assignedUserId: optionalText(z.string()),
  expectedCloseDate: optionalText(z.string().date()),
  nextStepDescription: optionalText(z.string()),
  nextStepOwnerId: optionalText(z.string()),
  nextStepDate: optionalText(z.string().date()),
});

export const updateDealSchema = createDealSchema.omit({ companyId: true }).partial();

// El motivo de pérdida es obligatorio al marcar PERDIDO (spec de negocio, sección 22) y no aplica
// a ninguna otra etapa, así que la regla vive en el schema y no en el servicio.
export const setDealStageSchema = z
  .object({
    stage: dealStageSchema,
    lostReason: optionalText(z.string()),
  })
  .refine((v) => v.stage !== 'PERDIDO' || !!v.lostReason, {
    message: 'Indica el motivo de pérdida',
    path: ['lostReason'],
  });

export const assignDealSchema = z.object({
  assignedUserId: optionalText(z.string()),
});

export interface DealDTO {
  id: string;
  companyId: string;
  companyName: string;
  title: string;
  amount: string;
  currency: 'PEN' | 'USD';
  stage: z.infer<typeof dealStageSchema>;
  assignedUserId: string | null;
  expectedCloseDate: string | null;
  lostReason: string | null;
  nextStepDescription: string | null;
  nextStepOwnerId: string | null;
  nextStepDate: string | null;
  createdAt: string;
  updatedAt: string;
}
