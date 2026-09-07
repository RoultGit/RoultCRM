import { z } from 'zod';

export const lineSchema = z.enum(['WEB', 'SOFTWARE']);
export type Line = z.infer<typeof lineSchema>;

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
