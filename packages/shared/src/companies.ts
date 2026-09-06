import { z } from 'zod';
import { lineSchema } from './common.js';

export const createCompanySchema = z.object({
  name: z.string().min(1),
  line: lineSchema,
  city: z.string().optional(),
  source: z.string().optional(),
  whatsapp: z.string().optional(),
  email: z.string().email().optional(),
  assignedUserId: z.string().optional(),
  notes: z.string().optional(),
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
