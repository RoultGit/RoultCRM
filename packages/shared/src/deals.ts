import { z } from 'zod';
import { currencySchema, lineSchema, moneySchema, optionalText } from './common.js';

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

export const dealFiltersSchema = z.object({
  stage: optionalText(dealStageSchema),
  assignedUserId: optionalText(z.string()),
  currency: optionalText(currencySchema),
  line: optionalText(lineSchema),
  from: optionalText(z.string().date()),
  to: optionalText(z.string().date()),
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

// El pipeline no tiene etapa "Ganado", así que hay que definir qué cuenta como tal. Se toma el
// momento en que el cliente pone plata: del adelanto en adelante el deal está ganado, antes está
// todavía en juego. Cambiar estas listas cambia el dashboard entero, que es justamente la idea.
export const DEAL_STAGE_GROUPS = {
  active: ['CONTACTO', 'PROPUESTA', 'NEGOCIACION'],
  won: ['ADELANTO', 'PRODUCCION', 'ENTREGADO', 'MANTENIMIENTO'],
  lost: ['PERDIDO'],
} as const;

export interface MoneyByCurrency {
  PEN: string;
  USD: string;
}

export interface DashboardDTO {
  leadsNew: number;
  dealsActive: number;
  dealsWon: number;
  dealsLost: number;
  wonAmount: MoneyByCurrency;
  activeAmount: MoneyByCurrency;
  clientsActive: number;
  tasksUpcoming: number;
  tasksOverdue: number;
}
