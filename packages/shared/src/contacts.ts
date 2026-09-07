import { z } from 'zod';
import { optionalText } from './common.js';

export const createContactSchema = z.object({
  companyId: z.string().min(1, 'Selecciona una empresa'),
  name: z.string().min(1, 'Ingresa el nombre del contacto'),
  position: optionalText(z.string()),
  phone: optionalText(z.string()),
  whatsapp: optionalText(z.string()),
  email: optionalText(z.string().email()),
  notes: optionalText(z.string()),
  confirmDuplicate: z.boolean().optional(),
});

export const updateContactSchema = createContactSchema.omit({ confirmDuplicate: true, companyId: true }).partial();

export interface ContactDTO {
  id: string;
  companyId: string;
  companyName: string;
  name: string;
  position: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}
