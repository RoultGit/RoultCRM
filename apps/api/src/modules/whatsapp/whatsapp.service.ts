import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { RelatedType } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { NotFoundError, ValidationError, ForbiddenError } from '../../lib/errors.js';
import { ownerFilter, type Actor } from '../../lib/scope.js';
import { seal, open as unseal, hasEncryptionKey } from '../../lib/secretBox.js';
import { sendText, sendTemplate, toWaNumber, type SendResult } from '../../lib/whatsapp.js';
import { webOrigin } from '../../lib/mailer.js';

/** El autor de lo que escribe el cliente: no es nadie del equipo. */
export const WHATSAPP_AUTHOR = 'whatsapp:inbound';

export interface WhatsAppStatus {
  connected: boolean;
  encryptionReady: boolean;
  phoneNumberId?: string;
  displayPhone?: string | null;
  verifyToken?: string;
  webhookUrl: string;
  lastError?: string | null;
  lastErrorAt?: string | null;
}

async function assertCanSee(actor: Actor, relatedType: RelatedType, relatedId: string): Promise<void> {
  const { tenantId } = actor;
  const owner = ownerFilter(actor);
  const found = await (async () => {
    switch (relatedType) {
      case 'COMPANY':
        return prisma.company.findFirst({ where: { id: relatedId, tenantId, ...owner }, select: { id: true } });
      case 'LEAD':
        return prisma.lead.findFirst({ where: { id: relatedId, tenantId, ...owner }, select: { id: true } });
      case 'DEAL':
        return prisma.deal.findFirst({ where: { id: relatedId, tenantId, ...owner }, select: { id: true } });
      case 'CONTACT':
        return prisma.contact.findFirst({
          where: { id: relatedId, tenantId, company: { ...owner } },
          select: { id: true },
        });
    }
  })();
  if (!found) throw new NotFoundError('Record not found');
}

export const WhatsAppService = {
  async status(actor: Actor): Promise<WhatsAppStatus> {
    const account = await prisma.whatsAppAccount.findUnique({ where: { tenantId: actor.tenantId } });
    const webhookUrl = `${webOrigin()}/api/whatsapp/webhook`;
    if (!account) return { connected: false, encryptionReady: hasEncryptionKey(), webhookUrl };
    return {
      connected: true,
      encryptionReady: hasEncryptionKey(),
      phoneNumberId: account.phoneNumberId,
      displayPhone: account.displayPhone,
      // El token de verificación no es secreto para nosotros: hay que poder copiarlo y pegarlo en
      // Meta. El de acceso NO se devuelve nunca, ni cortado.
      verifyToken: account.verifyToken,
      webhookUrl,
      lastError: account.lastError,
      lastErrorAt: account.lastErrorAt?.toISOString() ?? null,
    };
  },

  async connect(
    actor: Actor,
    input: { phoneNumberId: string; accessToken: string; appSecret?: string; displayPhone?: string }
  ): Promise<WhatsAppStatus> {
    if (actor.role !== 'ADMIN') throw new ForbiddenError('Solo un administrador puede conectar WhatsApp');
    if (!hasEncryptionKey()) {
      // Guardar el token en claro sería peor que no tener la función: quien lea la base habla en
      // nombre del cliente con sus propios clientes.
      throw new ValidationError('Falta configurar ENCRYPTION_KEY en el servidor. Sin eso no se guardan credenciales.');
    }
    const data = {
      phoneNumberId: input.phoneNumberId.trim(),
      displayPhone: input.displayPhone?.trim() || null,
      accessToken: seal(input.accessToken.trim()),
      appSecret: input.appSecret?.trim() ? seal(input.appSecret.trim()) : null,
      verifyToken: randomBytes(16).toString('hex'),
      lastError: null,
      lastErrorAt: null,
    };
    await prisma.whatsAppAccount.upsert({
      where: { tenantId: actor.tenantId },
      // Al reconectar se conserva el token de verificación: cambiarlo rompería el webhook que ya
      // está dado de alta en Meta, y nadie relaciona una cosa con la otra.
      update: { ...data, verifyToken: undefined },
      create: { tenantId: actor.tenantId, ...data },
    });
    return this.status(actor);
  },

  async disconnect(actor: Actor): Promise<void> {
    if (actor.role !== 'ADMIN') throw new ForbiddenError('Solo un administrador puede desconectar WhatsApp');
    await prisma.whatsAppAccount.deleteMany({ where: { tenantId: actor.tenantId } });
  },

  /** Manda un mensaje y lo deja anotado en la historia del cliente. */
  async send(
    actor: Actor,
    input: { relatedType: RelatedType; relatedId: string; to: string; body: string; template?: string }
  ): Promise<SendResult> {
    await assertCanSee(actor, input.relatedType, input.relatedId);
    const account = await prisma.whatsAppAccount.findUnique({ where: { tenantId: actor.tenantId } });
    if (!account) throw new ValidationError('WhatsApp no está conectado. Conectalo en Conexiones.');

    const token = unseal(account.accessToken);
    const result = input.template
      ? await sendTemplate(account.phoneNumberId, token, input.to, input.template, 'es', [input.body])
      : await sendText(account.phoneNumberId, token, input.to, input.body);

    if (!result.ok) {
      // El último error queda a la vista en Conexiones: si el token venció, el vendedor ve por qué
      // dejaron de salir los mensajes en vez de pensar que el CRM está roto.
      await prisma.whatsAppAccount.update({
        where: { id: account.id },
        data: { lastError: result.error ?? 'Error desconocido', lastErrorAt: new Date() },
      });
      return result;
    }

    await prisma.activity.create({
      data: {
        tenantId: actor.tenantId,
        authorId: actor.userId,
        relatedType: input.relatedType,
        relatedId: input.relatedId,
        type: 'WHATSAPP',
        body: input.body,
        occurredAt: new Date(),
      },
    });
    if (account.lastError) {
      await prisma.whatsAppAccount.update({ where: { id: account.id }, data: { lastError: null, lastErrorAt: null } });
    }
    return result;
  },
};

// ── Webhook ──────────────────────────────────────────────────────────────────

/**
 * El apretón de manos que hace Meta al dar de alta el webhook.
 *
 * Devuelve el challenge solo si el token coincide con el de ALGUNA cuenta conectada. Sin esa
 * comprobación, cualquiera podría dar de alta nuestro webhook en su propia app de Meta.
 */
export async function verifyWebhook(mode: string, token: string, challenge: string): Promise<string | null> {
  if (mode !== 'subscribe' || !token) return null;
  const account = await prisma.whatsAppAccount.findFirst({ where: { verifyToken: token } });
  return account ? challenge : null;
}

/** La firma que Meta pone en cada webhook, contra el secreto de la app del cliente. */
export function signatureMatches(rawBody: Buffer | string, header: string | undefined, appSecret: string): boolean {
  if (!header?.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const given = header.slice(7);
  return (
    given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected))
  );
}

interface WebhookPayload {
  entry?: {
    changes?: {
      value?: {
        metadata?: { phone_number_id?: string; display_phone_number?: string };
        contacts?: { profile?: { name?: string }; wa_id?: string }[];
        messages?: { from?: string; type?: string; text?: { body?: string }; timestamp?: string }[];
      };
    }[];
  }[];
}

export interface WebhookResult {
  handled: number;
  ignored: number;
}

/**
 * Guarda lo que escribe el cliente en la historia de su ficha.
 *
 * El número que contesta es la única pista de con quién se está hablando, así que se compara por
 * los últimos 9 dígitos: en la base los teléfonos están cargados a mano, con espacios, guiones y
 * con o sin el código de país.
 */
export async function handleWebhook(
  payload: WebhookPayload,
  rawBody: Buffer | string,
  signatureHeader?: string
): Promise<WebhookResult> {
  const result: WebhookResult = { handled: 0, ignored: 0 };

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      const phoneNumberId = value?.metadata?.phone_number_id;
      if (!phoneNumberId || !value?.messages?.length) {
        result.ignored += 1;
        continue;
      }

      // El número de destino dice de qué empresa cliente es el mensaje. Es lo único que separa un
      // tenant de otro acá adentro.
      const account = await prisma.whatsAppAccount.findUnique({ where: { phoneNumberId } });
      if (!account) {
        result.ignored += 1;
        continue;
      }

      if (account.appSecret) {
        // Sin firma verificada, cualquiera que sepa la URL puede inventar conversaciones dentro
        // del CRM de un cliente.
        if (!signatureMatches(rawBody, signatureHeader, unseal(account.appSecret))) {
          result.ignored += 1;
          continue;
        }
      }

      for (const message of value.messages) {
        const from = message.from;
        const body = message.type === 'text' ? message.text?.body : `[${message.type ?? 'adjunto'}]`;
        if (!from || !body) {
          result.ignored += 1;
          continue;
        }
        const nombre = value.contacts?.[0]?.profile?.name;
        const cuando = message.timestamp ? new Date(Number(message.timestamp) * 1000) : new Date();
        await anotarEntrante(account.tenantId, from, body, cuando, nombre);
        result.handled += 1;
      }
    }
  }
  return result;
}

async function anotarEntrante(
  tenantId: string,
  from: string,
  body: string,
  occurredAt: Date,
  nombre?: string
): Promise<void> {
  const ultimos = toWaNumber(from).slice(-9);

  const contacto = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Contact"
    WHERE "tenantId" = ${tenantId}
      AND right(regexp_replace(coalesce(NULLIF(whatsapp, ''), phone, ''), '\\D', '', 'g'), 9) = ${ultimos}
    LIMIT 1`;
  if (contacto[0]) return anotar(tenantId, 'CONTACT', contacto[0].id, body, occurredAt);

  const lead = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Lead"
    WHERE "tenantId" = ${tenantId}
      AND right(regexp_replace(coalesce(NULLIF(whatsapp, ''), phone, ''), '\\D', '', 'g'), 9) = ${ultimos}
    ORDER BY "createdAt" DESC
    LIMIT 1`;
  if (lead[0]) return anotar(tenantId, 'LEAD', lead[0].id, body, occurredAt);

  // Nadie con ese número: es alguien nuevo escribiendo al número de la empresa, o sea un lead.
  // Perderlo sería el peor resultado posible de conectar WhatsApp.
  const nuevo = await prisma.lead.create({
    data: {
      tenantId,
      businessName: nombre?.trim() || `WhatsApp ${from}`,
      contactName: nombre?.trim() || 'Escribió por WhatsApp',
      whatsapp: from,
      line: 'SERVICIO',
      source: 'WhatsApp',
    },
  });
  return anotar(tenantId, 'LEAD', nuevo.id, body, occurredAt);
}

async function anotar(
  tenantId: string,
  relatedType: RelatedType,
  relatedId: string,
  body: string,
  occurredAt: Date
): Promise<void> {
  await prisma.activity.create({
    data: { tenantId, authorId: WHATSAPP_AUTHOR, relatedType, relatedId, type: 'WHATSAPP', body, occurredAt },
  });
}
