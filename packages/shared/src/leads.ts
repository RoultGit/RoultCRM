import { z } from 'zod';
import { billingTypeSchema, currencySchema, lineSchema, moneySchema, optionalText } from './common.js';

export const leadStatusSchema = z.enum(['NEW', 'CONTACTED', 'QUALIFIED', 'CONVERTED', 'UNQUALIFIED', 'LOST']);

export const createLeadSchema = z.object({
  businessName: z.string().min(1, 'Ingresa la empresa o persona'),
  contactName: z.string().min(1, 'Ingresa el nombre de contacto'),
  representativeName: optionalText(z.string()),
  phone: optionalText(z.string()),
  whatsapp: optionalText(z.string()),
  email: optionalText(z.string().email()),
  line: lineSchema,
  billingType: billingTypeSchema.optional(),
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
  billingType: optionalText(billingTypeSchema),
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
      billingType: billingTypeSchema.optional(),
    })
    .optional(),
});

export interface LeadDTO {
  id: string;
  businessName: string;
  contactName: string;
  representativeName: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  line: z.infer<typeof lineSchema>;
  billingType: z.infer<typeof billingTypeSchema>;
  source: string | null;
  assignedUserId: string | null;
  status: 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'CONVERTED' | 'UNQUALIFIED' | 'LOST';
  notes: string | null;
  convertedCompanyId: string | null;
  convertedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
