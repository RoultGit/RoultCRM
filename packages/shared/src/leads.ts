import { z } from 'zod';
import { currencySchema, lineSchema, moneySchema, optionalText } from './common.js';

export const leadStatusSchema = z.enum(['NEW', 'CONTACTED', 'QUALIFIED', 'CONVERTED', 'UNQUALIFIED', 'LOST']);

export const createLeadSchema = z.object({
  businessName: z.string().min(1, 'Ingresa la empresa o persona'),
  contactName: z.string().min(1, 'Ingresa el nombre de contacto'),
  phone: optionalText(z.string()),
  whatsapp: optionalText(z.string()),
  email: optionalText(z.string().email()),
  line: lineSchema,
  source: optionalText(z.string()),
  assignedUserId: optionalText(z.string()),
  notes: optionalText(z.string()),
});

export const updateLeadSchema = createLeadSchema.partial();

export const setLeadStatusSchema = z.object({
  status: leadStatusSchema.exclude(['CONVERTED']),
});

export const leadFiltersSchema = z.object({
  status: optionalText(leadStatusSchema),
  assignedUserId: optionalText(z.string()),
  line: optionalText(lineSchema),
  source: optionalText(z.string()),
});

export const convertLeadSchema = z.object({
  confirmDuplicate: z.boolean().optional(),
  // Convertir un lead crea el cliente y, en el mismo paso, su primera oportunidad de venta. Un deal
  // sin monto no le sirve ni al pipeline ni al dashboard, así que si viene, viene completo.
  deal: z
    .object({
      title: z.string().min(1, 'Ingresa el título de la oportunidad'),
      amount: moneySchema,
      currency: currencySchema,
    })
    .optional(),
});

export interface LeadDTO {
  id: string;
  businessName: string;
  contactName: string;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  line: 'WEB' | 'SOFTWARE';
  source: string | null;
  assignedUserId: string | null;
  status: 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'CONVERTED' | 'UNQUALIFIED' | 'LOST';
  notes: string | null;
  convertedCompanyId: string | null;
  convertedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
