import { randomBytes } from 'node:crypto';
import {
  quoteTotals,
  type QuoteDTO,
  type PublicQuoteDTO,
  type createQuoteSchema,
  type updateQuoteSchema,
  type respondQuoteSchema,
} from '@roult/shared';
import type { z } from 'zod';
import { Prisma } from '@prisma/client';
import type { Quote, QuoteItem } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { NotFoundError, ConflictError, ValidationError } from '../../lib/errors.js';
import { ownerFilter, defaultAssignee, type Actor } from '../../lib/scope.js';
import { webOrigin } from '../../lib/mailer.js';

type ConItems = Quote & { items: QuoteItem[]; company: { name: string } };

function toDTO(quote: ConItems): QuoteDTO {
  const items = quote.items
    .sort((a, b) => a.position - b.position)
    .map((item) => ({
      description: item.description,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
      lineTotal: Math.round(Number(item.quantity) * Number(item.unitPrice) * 100) / 100,
    }));

  return {
    id: quote.id,
    number: quote.number,
    companyId: quote.companyId,
    companyName: quote.company.name,
    dealId: quote.dealId,
    title: quote.title,
    status: quote.status,
    currency: quote.currency,
    taxRate: Number(quote.taxRate),
    validUntil: quote.validUntil?.toISOString() ?? null,
    notes: quote.notes,
    terms: quote.terms,
    assignedUserId: quote.assignedUserId,
    createdById: quote.createdById,
    sentAt: quote.sentAt?.toISOString() ?? null,
    viewedAt: quote.viewedAt?.toISOString() ?? null,
    respondedAt: quote.respondedAt?.toISOString() ?? null,
    respondedBy: quote.respondedBy,
    createdAt: quote.createdAt.toISOString(),
    items,
    // El link no existe hasta que se envía: si existiera desde el borrador, un vendedor podría
    // pasarle por error un precio que todavía estaba armando.
    publicUrl: quote.status === 'DRAFT' ? null : `${webOrigin()}/cotizacion/${quote.publicToken}`,
    ...quoteTotals(items, Number(quote.taxRate)),
  };
}

const INCLUDE = { items: true, company: { select: { name: true } } } as const;

/** ¿Este actor puede cotizarle a este cliente? Mismo alcance que su propia pantalla de empresas. */
async function assertCompany(actor: Actor, companyId: string): Promise<void> {
  const found = await prisma.company.findFirst({
    where: { id: companyId, tenantId: actor.tenantId, ...ownerFilter(actor) },
    select: { id: true },
  });
  // 404 y no 403: decir "existe pero no es tuyo" ya revela que ese cliente existe en la empresa.
  if (!found) throw new NotFoundError('Company not found');
}

async function findMine(actor: Actor, id: string): Promise<ConItems> {
  const quote = await prisma.quote.findFirst({
    where: { id, tenantId: actor.tenantId, ...ownerFilter(actor) },
    include: INCLUDE,
  });
  if (!quote) throw new NotFoundError('Quote not found');
  return quote;
}

function itemsData(items: z.infer<typeof createQuoteSchema>['items']) {
  return items.map((item, position) => ({
    description: item.description,
    quantity: new Prisma.Decimal(item.quantity),
    unitPrice: new Prisma.Decimal(item.unitPrice),
    position,
  }));
}

function venceHoyOAntes(validUntil: Date | null, now = new Date()): boolean {
  if (!validUntil) return false;
  // La validez se compara por DÍA: una cotización que vale "hasta el 30" vale todo el 30.
  return validUntil < new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export const QuotesService = {
  async list(actor: Actor, filters: { companyId?: string; status?: string; dealId?: string } = {}): Promise<QuoteDTO[]> {
    const quotes = await prisma.quote.findMany({
      where: {
        AND: [
          { tenantId: actor.tenantId, ...ownerFilter(actor) },
          {
            ...(filters.companyId ? { companyId: filters.companyId } : {}),
            ...(filters.dealId ? { dealId: filters.dealId } : {}),
            ...(filters.status ? { status: filters.status as Quote['status'] } : {}),
          },
        ],
      },
      include: INCLUDE,
      orderBy: { number: 'desc' },
    });
    return quotes.map(toDTO);
  },

  async get(actor: Actor, id: string): Promise<QuoteDTO> {
    return toDTO(await findMine(actor, id));
  },

  async create(actor: Actor, input: z.infer<typeof createQuoteSchema>): Promise<QuoteDTO> {
    await assertCompany(actor, input.companyId);

    // El correlativo se calcula y se inserta en la MISMA transacción, y la restricción única de
    // [tenantId, number] es el respaldo: si dos vendedores cotizan en el mismo instante, una de las
    // dos falla y se reintenta, en vez de que las dos queden con el número 7.
    const quote = await prisma.$transaction(async (tx) => {
      const ultima = await tx.quote.findFirst({
        where: { tenantId: actor.tenantId },
        orderBy: { number: 'desc' },
        select: { number: true },
      });
      return tx.quote.create({
        data: {
          tenantId: actor.tenantId,
          number: (ultima?.number ?? 0) + 1,
          companyId: input.companyId,
          dealId: input.dealId ?? null,
          title: input.title,
          currency: input.currency,
          taxRate: new Prisma.Decimal(input.taxRate),
          validUntil: input.validUntil ? new Date(input.validUntil) : null,
          notes: input.notes ?? null,
          terms: input.terms ?? null,
          createdById: actor.userId,
          assignedUserId: defaultAssignee(actor, input.assignedUserId) ?? null,
          publicToken: randomBytes(24).toString('base64url'),
          items: { create: itemsData(input.items) },
        },
        include: INCLUDE,
      });
    });
    return toDTO(quote);
  },

  async update(actor: Actor, id: string, input: z.infer<typeof updateQuoteSchema>): Promise<QuoteDTO> {
    const existing = await findMine(actor, id);
    // Cambiar los números de algo que el cliente ya tiene en la mano es la peor clase de bug: el
    // total que ve él y el que ve el vendedor dejarían de ser el mismo.
    if (existing.status !== 'DRAFT') {
      throw new ConflictError('Una cotización ya enviada no se edita. Duplicala y mandá la nueva.');
    }

    await prisma.quote.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.currency !== undefined ? { currency: input.currency } : {}),
        ...(input.taxRate !== undefined ? { taxRate: new Prisma.Decimal(input.taxRate) } : {}),
        ...(input.validUntil !== undefined ? { validUntil: input.validUntil ? new Date(input.validUntil) : null } : {}),
        ...(input.notes !== undefined ? { notes: input.notes ?? null } : {}),
        ...(input.terms !== undefined ? { terms: input.terms ?? null } : {}),
        ...(input.dealId !== undefined ? { dealId: input.dealId ?? null } : {}),
        ...(input.assignedUserId !== undefined ? { assignedUserId: input.assignedUserId ?? null } : {}),
        // Las líneas se reemplazan enteras: emparejarlas una por una para editarlas en su lugar
        // sería mucho código para un borrador que nadie vio todavía.
        ...(input.items ? { items: { deleteMany: {}, create: itemsData(input.items) } } : {}),
      },
    });
    return toDTO(await findMine(actor, id));
  },

  async send(actor: Actor, id: string): Promise<QuoteDTO> {
    const existing = await findMine(actor, id);
    if (existing.status === 'ACCEPTED' || existing.status === 'REJECTED') {
      throw new ConflictError('Esa cotización ya la respondió el cliente');
    }
    await prisma.quote.update({
      where: { id },
      data: { status: 'SENT', sentAt: existing.sentAt ?? new Date() },
    });
    return toDTO(await findMine(actor, id));
  },

  async remove(actor: Actor, id: string): Promise<void> {
    const existing = await findMine(actor, id);
    // Una cotización respondida es el respaldo de lo que el cliente aceptó o rechazó: no puede
    // desaparecer porque a alguien le moleste tenerla ahí.
    if (existing.status === 'ACCEPTED' || existing.status === 'REJECTED') {
      throw new ConflictError('Una cotización que el cliente ya respondió no se borra');
    }
    await prisma.quote.delete({ where: { id } });
  },
};

// ── La vista del cliente, sin sesión ─────────────────────────────────────────

async function findPublic(token: string): Promise<ConItems> {
  const quote = await prisma.quote.findUnique({ where: { publicToken: token }, include: INCLUDE });
  // Un borrador no existe para afuera: el link recién tiene sentido cuando alguien decidió enviarlo.
  if (!quote || quote.status === 'DRAFT') throw new NotFoundError('Quote not found');
  return quote;
}

export const PublicQuotes = {
  /** Lo que ve el cliente. Devuelve SOLO lo que va impreso: ni ids internos ni datos del equipo. */
  async get(token: string): Promise<PublicQuoteDTO> {
    const quote = await findPublic(token);
    // El nombre de quien vende se pide aparte: Quote no necesita una clave foránea al tenant solo
    // para leer un nombre en el encabezado.
    const vendedor = await prisma.tenant.findUniqueOrThrow({
      where: { id: quote.tenantId },
      select: { name: true },
    });

    // Se marca la primera vez que la abre y no cada vez: lo que importa es si llegó a verla.
    if (!quote.viewedAt) {
      await prisma.quote.update({ where: { id: quote.id }, data: { viewedAt: new Date() } });
    }

    const items = quote.items
      .sort((a, b) => a.position - b.position)
      .map((item) => ({
        description: item.description,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        lineTotal: Math.round(Number(item.quantity) * Number(item.unitPrice) * 100) / 100,
      }));

    return {
      number: quote.number,
      title: quote.title,
      status: quote.status,
      currency: quote.currency,
      taxRate: Number(quote.taxRate),
      validUntil: quote.validUntil?.toISOString() ?? null,
      notes: quote.notes,
      terms: quote.terms,
      createdAt: quote.createdAt.toISOString(),
      respondedBy: quote.respondedBy,
      items,
      vendorName: vendedor.name,
      companyName: quote.company.name,
      canRespond: quote.status === 'SENT' && !venceHoyOAntes(quote.validUntil),
      ...quoteTotals(items, Number(quote.taxRate)),
    };
  },

  async respond(token: string, input: z.infer<typeof respondQuoteSchema>): Promise<{ status: string }> {
    const quote = await findPublic(token);

    // Sin esto, alguien podría "des-aceptar" una cotización cerrada apretando el otro botón.
    if (quote.status !== 'SENT') throw new ConflictError('Esa cotización ya fue respondida');
    if (venceHoyOAntes(quote.validUntil)) {
      throw new ConflictError('Esta cotización venció. Pedile al vendedor que te mande una nueva.');
    }
    if (!input.respondedBy.trim()) throw new ValidationError('Poné tu nombre');

    const status = input.accept ? 'ACCEPTED' : 'REJECTED';
    await prisma.quote.update({
      where: { id: quote.id },
      data: { status, respondedAt: new Date(), respondedBy: input.respondedBy.trim() },
    });

    // Queda en la historia del cliente, que es donde el equipo la va a buscar. El autor es el
    // cliente, no alguien del equipo: nadie del CRM apretó ese botón.
    await prisma.activity.create({
      data: {
        tenantId: quote.tenantId,
        authorId: 'quote:public',
        relatedType: 'COMPANY',
        relatedId: quote.companyId,
        type: 'NOTE',
        body: `${input.respondedBy.trim()} ${input.accept ? 'aceptó' : 'rechazó'} la cotización ${quote.number} — ${quote.title}`,
        occurredAt: new Date(),
      },
    });

    return { status };
  },
};
