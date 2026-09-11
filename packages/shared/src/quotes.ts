import { z } from 'zod';
import { currencySchema } from './common.js';

export const quoteStatusSchema = z.enum(['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED']);
export type QuoteStatus = z.infer<typeof quoteStatusSchema>;

export const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  DRAFT: 'Borrador',
  SENT: 'Enviada',
  ACCEPTED: 'Aceptada',
  REJECTED: 'Rechazada',
  EXPIRED: 'Vencida',
};

export const quoteItemSchema = z.object({
  description: z.string().min(1, 'Poné qué es').max(500),
  quantity: z.number().positive('La cantidad tiene que ser mayor que cero'),
  unitPrice: z.number().min(0, 'El precio no puede ser negativo'),
});

export const createQuoteSchema = z.object({
  companyId: z.string().min(1, 'Elegí el cliente'),
  dealId: z.string().optional(),
  title: z.string().min(1, 'Ponele un título').max(200),
  currency: currencySchema,
  taxRate: z.number().min(0).max(100).default(18),
  validUntil: z.string().optional(),
  notes: z.string().max(4000).optional(),
  terms: z.string().max(4000).optional(),
  assignedUserId: z.string().optional(),
  items: z.array(quoteItemSchema).min(1, 'Una cotización sin líneas no cotiza nada'),
});

export const updateQuoteSchema = createQuoteSchema.partial().omit({ companyId: true });

/** Lo que responde el cliente desde el link público. */
export const respondQuoteSchema = z.object({
  accept: z.boolean(),
  respondedBy: z.string().min(1, 'Poné tu nombre').max(120),
});

export interface QuoteItemDTO {
  description: string;
  quantity: number;
  unitPrice: number;
  /** cantidad × precio, ya calculado, para no repetir la cuenta en cada pantalla. */
  lineTotal: number;
}

export interface QuoteTotals {
  subtotal: number;
  tax: number;
  total: number;
}

export interface QuoteDTO extends QuoteTotals {
  id: string;
  number: number;
  companyId: string;
  companyName: string;
  dealId: string | null;
  title: string;
  status: QuoteStatus;
  currency: z.infer<typeof currencySchema>;
  taxRate: number;
  validUntil: string | null;
  notes: string | null;
  terms: string | null;
  assignedUserId: string | null;
  createdById: string;
  sentAt: string | null;
  viewedAt: string | null;
  respondedAt: string | null;
  respondedBy: string | null;
  createdAt: string;
  items: QuoteItemDTO[];
  /** Solo se arma cuando la cotización ya se envió. */
  publicUrl: string | null;
}

/** Lo que ve el cliente en el link público: nada de ids internos ni del equipo de ventas. */
export interface PublicQuoteDTO extends QuoteTotals {
  number: number;
  title: string;
  status: QuoteStatus;
  currency: z.infer<typeof currencySchema>;
  taxRate: number;
  validUntil: string | null;
  notes: string | null;
  terms: string | null;
  createdAt: string;
  respondedBy: string | null;
  items: QuoteItemDTO[];
  vendorName: string;
  companyName: string;
  /** Si ya venció, el cliente la puede leer pero no aceptarla. */
  canRespond: boolean;
}

/**
 * Las cuentas de la cotización.
 *
 * Se calcula en céntimos y recién al final se vuelve a pesos: sumar 0.1 + 0.2 en punto flotante da
 * 0.30000000000000004, y en un total que el cliente firma eso es un centavo de diferencia que
 * alguien va a tener que explicar.
 */
export function quoteTotals(
  items: { quantity: number; unitPrice: number }[],
  taxRate: number
): QuoteTotals {
  const subtotalCent = items.reduce(
    (suma, item) => suma + Math.round(item.quantity * item.unitPrice * 100),
    0
  );
  const taxCent = Math.round((subtotalCent * taxRate) / 100);
  return {
    subtotal: subtotalCent / 100,
    tax: taxCent / 100,
    total: (subtotalCent + taxCent) / 100,
  };
}
