import { randomBytes, timingSafeEqual } from 'node:crypto';
import { prisma } from '../../lib/prisma.js';
import { recordAudit } from '../../lib/audit.js';
import { ForbiddenError } from '../../lib/errors.js';
import type { Actor } from '../../lib/scope.js';

/** El autor de lo que escribe el cliente: no es nadie del equipo. */
export const EMAIL_AUTHOR = 'email:inbound';

export function inboundDomain(): string {
  return process.env.INBOUND_DOMAIN ?? 'in.roult.pe';
}

export interface InboxStatus {
  enabled: boolean;
  address: string | null;
  /** Si falta el secreto, el buzón no puede recibir aunque la dirección exista. */
  ready: boolean;
}

function toStatus(inboundKey: string | null): InboxStatus {
  return {
    enabled: !!inboundKey,
    address: inboundKey ? `${inboundKey}@${inboundDomain()}` : null,
    ready: !!process.env.INBOUND_SECRET,
  };
}

export const EmailService = {
  async status(actor: Actor): Promise<InboxStatus> {
    const tenant = await prisma.tenant.findUniqueOrThrow({
      where: { id: actor.tenantId },
      select: { inboundKey: true },
    });
    return toStatus(tenant.inboundKey);
  },

  async enable(actor: Actor): Promise<InboxStatus> {
    if (actor.role !== 'ADMIN') throw new ForbiddenError('Solo un administrador puede activar el buzón');
    const tenant = await prisma.tenant.findUniqueOrThrow({
      where: { id: actor.tenantId },
      select: { inboundKey: true },
    });
    // Si ya tiene, se devuelve la misma: cambiarla rompería las copias ocultas ya configuradas en
    // los correos y en los teléfonos del equipo, y nadie relacionaría una cosa con la otra.
    if (tenant.inboundKey) return toStatus(tenant.inboundKey);

    const inboundKey = randomBytes(6).toString('hex');
    await prisma.tenant.update({ where: { id: actor.tenantId }, data: { inboundKey } });
    return toStatus(inboundKey);
  },

  async disable(actor: Actor): Promise<InboxStatus> {
    if (actor.role !== 'ADMIN') throw new ForbiddenError('Solo un administrador puede desactivar el buzón');
    await prisma.tenant.update({ where: { id: actor.tenantId }, data: { inboundKey: null } });
    return toStatus(null);
  },
};

// ── Lo que entra ─────────────────────────────────────────────────────────────

export function secretMatches(header: string | undefined): boolean {
  const expected = process.env.INBOUND_SECRET;
  if (!expected) return false;
  const given = header?.startsWith('Bearer ') ? header.slice(7) : '';
  // El largo se compara antes porque timingSafeEqual pide buffers iguales. El largo no es secreto.
  return given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

/** Saca la dirección de un "Nombre Apellido <alguien@dominio.pe>" o de un texto pelado. */
export function parseAddress(raw: string | { address?: string } | undefined | null): string | null {
  if (!raw) return null;
  const texto = typeof raw === 'string' ? raw : (raw.address ?? '');
  const entreSignos = texto.match(/<([^>]+)>/);
  const candidato = (entreSignos ? entreSignos[1] : texto).trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidato) ? candidato : null;
}

export interface InboundEmail {
  from?: string | { address?: string };
  to?: (string | { address?: string })[] | string;
  cc?: (string | { address?: string })[] | string;
  subject?: string;
  text?: string;
  messageId?: string;
  date?: string;
}

export interface InboundResult {
  stored: boolean;
  reason?: string;
}

function listaDeDirecciones(valor: InboundEmail['to']): string[] {
  if (!valor) return [];
  const items = Array.isArray(valor) ? valor : [valor];
  return items.map(parseAddress).filter((a): a is string => !!a);
}

/**
 * Guarda un correo en la ficha del cliente que corresponde.
 *
 * El camino es la copia oculta: el vendedor pone la dirección del buzón en copia y el correo cae
 * solo. Se eligió esto sobre conectar Gmail por OAuth porque OAuth pide un proyecto en Google
 * Cloud, verificación de la app y consentimiento de cada persona; la copia oculta funciona con
 * cualquier casilla de cualquier proveedor sin configurar nada del lado del vendedor.
 */
export async function handleInbound(email: InboundEmail): Promise<InboundResult> {
  const dominio = inboundDomain();
  const destinatarios = [...listaDeDirecciones(email.to), ...listaDeDirecciones(email.cc)];
  const buzon = destinatarios.find((a) => a.endsWith(`@${dominio}`));
  if (!buzon) return { stored: false, reason: 'ningún destinatario es un buzón del CRM' };

  const tenant = await prisma.tenant.findUnique({
    where: { inboundKey: buzon.split('@')[0] },
    select: { id: true },
  });
  // La llave del buzón es lo único que separa una empresa cliente de otra acá adentro.
  if (!tenant) return { stored: false, reason: 'ese buzón no existe' };

  const remitente = parseAddress(email.from);
  if (!remitente) return { stored: false, reason: 'sin remitente' };

  const nuestros = await prisma.user.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, email: true },
  });
  const porCorreo = new Map(nuestros.map((u) => [u.email.toLowerCase(), u.id]));

  // Si escribe alguien del equipo, el cliente es el destinatario; si escribe el cliente, es él.
  const autorInterno = porCorreo.get(remitente) ?? null;
  const contraparte = autorInterno
    ? destinatarios.find((a) => a !== buzon && !porCorreo.has(a))
    : remitente;
  if (!contraparte) {
    return { stored: false, reason: 'no se pudo saber de qué cliente es (¿reenviado sin el cliente en copia?)' };
  }

  const cuerpo = [email.subject?.trim(), email.text?.trim()].filter(Boolean).join('\n\n').slice(0, 5000);
  if (!cuerpo) return { stored: false, reason: 'sin asunto ni texto' };

  const destino = await ubicarFicha(tenant.id, contraparte);
  try {
    await prisma.activity.create({
      data: {
        tenantId: tenant.id,
        authorId: autorInterno ?? EMAIL_AUTHOR,
        relatedType: destino.type,
        relatedId: destino.id,
        type: 'EMAIL',
        body: cuerpo,
        occurredAt: email.date ? new Date(email.date) : new Date(),
        externalId: email.messageId ?? null,
      },
    });
  } catch (err) {
    // El índice único de [tenantId, externalId] es el que evita el duplicado cuando el mismo
    // correo llega por copia oculta Y porque el cliente respondió a todos.
    if (err instanceof Error && err.message.includes('Unique constraint')) {
      return { stored: false, reason: 'ya estaba guardado' };
    }
    throw err;
  }
  return { stored: true };
}

/** Contacto, lead o —si no lo conocemos— un lead nuevo: perder al que escribe sería lo peor. */
async function ubicarFicha(
  tenantId: string,
  correo: string
): Promise<{ type: 'CONTACT' | 'LEAD' | 'COMPANY'; id: string }> {
  const contacto = await prisma.contact.findFirst({
    where: { tenantId, email: { equals: correo, mode: 'insensitive' } },
    select: { id: true },
  });
  if (contacto) return { type: 'CONTACT', id: contacto.id };

  const lead = await prisma.lead.findFirst({
    where: { tenantId, email: { equals: correo, mode: 'insensitive' } },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  if (lead) return { type: 'LEAD', id: lead.id };

  const empresa = await prisma.company.findFirst({
    where: { tenantId, email: { equals: correo, mode: 'insensitive' } },
    select: { id: true },
  });
  if (empresa) return { type: 'COMPANY', id: empresa.id };

  const nuevo = await prisma.lead.create({
    data: {
      tenantId,
      businessName: correo.split('@')[1] ?? correo,
      contactName: correo.split('@')[0],
      email: correo,
      line: 'SERVICIO',
      source: 'Correo',
    },
  });

  // Igual que el lead del formulario: pasa por recordAudit para que las automatizaciones lo vean.
  // El autor es el buzón, no una persona.
  await recordAudit(
    { tenantId, userId: 'email:inbound', role: 'ADMIN' } as Actor,
    { action: 'CREATE', entityType: 'LEAD', entityId: nuevo.id }
  );
  return { type: 'LEAD', id: nuevo.id };
}
