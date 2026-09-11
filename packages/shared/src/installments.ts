import { z } from 'zod';
import { currencySchema } from './common.js';

export const installmentPlanSchema = z.enum(['ADELANTO_SALDO', 'CUOTAS_IGUALES', 'MENSUAL']);
export type InstallmentPlan = z.infer<typeof installmentPlanSchema>;

export const PLAN_LABEL: Record<InstallmentPlan, string> = {
  ADELANTO_SALDO: 'Adelanto y saldo',
  CUOTAS_IGUALES: 'Cuotas iguales',
  MENSUAL: 'Mensual',
};

export const createInstallmentSchema = z.object({
  dealId: z.string().min(1),
  concept: z.string().min(1, 'Poné de qué es la cuota').max(200),
  amount: z.number().positive('El monto tiene que ser mayor que cero'),
  dueDate: z.string().min(1, 'Falta la fecha de vencimiento'),
  note: z.string().max(1000).optional(),
});

export const updateInstallmentSchema = z.object({
  concept: z.string().min(1).max(200).optional(),
  amount: z.number().positive().optional(),
  dueDate: z.string().optional(),
  note: z.string().max(1000).optional(),
});

export const payInstallmentSchema = z.object({
  paidAt: z.string().optional(),
  /** Lo que entró de verdad. Vacío significa "lo mismo que decía la cuota". */
  paidAmount: z.number().positive().optional(),
  method: z.string().max(60).optional(),
  note: z.string().max(1000).optional(),
});

export const generatePlanSchema = z
  .object({
    dealId: z.string().min(1),
    plan: installmentPlanSchema,
    /** Desde cuándo arranca el plan. Vacío = hoy. */
    startDate: z.string().optional(),
    /** ADELANTO_SALDO: cuánto va de adelanto. */
    upfrontPct: z.number().min(1).max(99).default(50),
    /** ADELANTO_SALDO: a cuántos días vence el saldo. */
    balanceDays: z.number().int().min(0).max(365).default(30),
    /** CUOTAS_IGUALES y MENSUAL: cuántas. */
    count: z.number().int().min(1).max(60).default(3),
    /** Si no se manda, sale del monto de la venta. */
    total: z.number().positive().optional(),
  })
  .refine((v) => v.plan !== 'ADELANTO_SALDO' || v.upfrontPct < 100, {
    message: 'El adelanto no puede ser el total',
    path: ['upfrontPct'],
  });

export interface InstallmentDTO {
  id: string;
  dealId: string;
  dealTitle: string;
  companyId: string;
  companyName: string;
  concept: string;
  amount: number;
  currency: z.infer<typeof currencySchema>;
  dueDate: string;
  paidAt: string | null;
  paidAmount: number | null;
  method: string | null;
  note: string | null;
  /** Calculado al leer: una cuota vencida es la que no se pagó y ya pasó su fecha. */
  overdue: boolean;
}

/** Lo que falta cobrar y lo que ya está vencido, por moneda. Nunca en un solo número. */
export interface ReceivableTotals {
  pending: Record<string, number>;
  overdue: Record<string, number>;
  paid: Record<string, number>;
}

/**
 * Parte un total en n cuotas sin perder ni inventar centavos.
 *
 * Dividir 6200 en 3 da 2066.666…; redondear cada cuota por su lado deja 6200.01 o 6199.99, y esa
 * diferencia la termina viendo el cliente en el estado de cuenta. La última cuota absorbe el resto.
 */
export function splitAmount(total: number, parts: number): number[] {
  const totalCent = Math.round(total * 100);
  const base = Math.floor(totalCent / parts);
  const montos = Array.from({ length: parts }, () => base);
  montos[parts - 1] += totalCent - base * parts;
  return montos.map((c) => c / 100);
}
