import { z } from 'zod';
import { lineSchema, optionalText } from './common.js';

export const createCompanySchema = z.object({
  name: z.string().min(1, 'Ingresa el nombre de la empresa'),
  line: lineSchema,
  city: optionalText(z.string()),
  source: optionalText(z.string()),
  whatsapp: optionalText(z.string()),
  email: optionalText(z.string().email()),
  assignedUserId: optionalText(z.string()),
  notes: optionalText(z.string()),
  confirmDuplicate: z.boolean().optional(),
});

export const updateCompanySchema = createCompanySchema.omit({ confirmDuplicate: true }).partial();

export interface CompanyDTO {
  id: string;
  name: string;
  line: 'WEB' | 'SOFTWARE';
  city: string | null;
  source: string | null;
  whatsapp: string | null;
  email: string | null;
  assignedUserId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}
