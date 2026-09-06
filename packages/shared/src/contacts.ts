import { z } from 'zod';

export const createContactSchema = z.object({
  companyId: z.string().min(1),
  name: z.string().min(1),
  position: z.string().optional(),
  phone: z.string().optional(),
  whatsapp: z.string().optional(),
  email: z.string().email().optional(),
  notes: z.string().optional(),
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
