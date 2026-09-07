import { z } from 'zod';

export const lineSchema = z.enum(['WEB', 'SOFTWARE']);
export type Line = z.infer<typeof lineSchema>;

// An untouched HTML input submits "" for an optional field, which `.email()` rejects and
// which would otherwise be stored as an empty string where the DTO promises null.
// Treat "" as "field not filled in".
export const optionalText = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema.optional());
