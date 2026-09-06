import { z } from 'zod';

export const lineSchema = z.enum(['WEB', 'SOFTWARE']);
export type Line = z.infer<typeof lineSchema>;
