import { z } from 'zod';

export const lineSchema = z.enum(['WEB', 'SOFTWARE', 'AUTOMATIZACION', 'SERVICIO']);
export type Line = z.infer<typeof lineSchema>;

export const LINE_LABEL: Record<Line, string> = {
  WEB: 'Web',
  SOFTWARE: 'Software',
  AUTOMATIZACION: 'Automatizaciones',
  SERVICIO: 'Servicio',
};

// Un único lugar donde se arman las opciones de línea. Antes estaban escritas a mano en cada
// formulario y cada filtro: agregar una línea obligaba a acordarse de siete archivos, y el que se
// olvidaba quedaba mudo sin avisar.
export const LINE_OPTIONS = (Object.keys(LINE_LABEL) as Line[]).map((value) => ({
  value,
  label: LINE_LABEL[value],
}));

// Qué se cobra: una vez, o todos los meses.
export const billingTypeSchema = z.enum(['ONE_TIME', 'MONTHLY']);
export type BillingType = z.infer<typeof billingTypeSchema>;

export const BILLING_LABEL: Record<BillingType, string> = {
  ONE_TIME: 'Pago único',
  MONTHLY: 'Suscripción mensual',
};

export const BILLING_OPTIONS = (Object.keys(BILLING_LABEL) as BillingType[]).map((value) => ({
  value,
  label: BILLING_LABEL[value],
}));

// An untouched HTML input submits "" for an optional field, which `.email()` rejects and
// which would otherwise be stored as an empty string where the DTO promises null.
// Treat "" as "field not filled in".
export const optionalText = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema.optional());

export const currencySchema = z.enum(['PEN', 'USD']);
export type Currency = z.infer<typeof currencySchema>;

// El monto viaja como string, no como number: un Decimal(12,2) de Postgres no entra sin pérdida en
// un float de JS, y el input del formulario ya es un string. Se convierte a número solo para mostrar.
export const moneySchema = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, 'Monto inválido (ej. 8000 o 8000.50)');
