import { createHash, randomBytes } from 'node:crypto';
import type { LeadDTO, createLeadSchema } from '@roult/shared';
import type { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { UnauthorizedError, NotFoundError } from '../../lib/errors.js';
import { LeadsRepository } from '../leads/leads.repository.js';
import { toDTO as leadToDTO } from '../leads/leads.service.js';
import { recordAudit } from '../../lib/audit.js';
import type { Actor } from '../../lib/scope.js';

const PREFIX = 'rk_';

// Mismo criterio que el refresh token: se guarda el hash y nunca la clave. Sha256 y no bcrypt
// porque la clave son 32 bytes aleatorios — no hay nada que adivinar por fuerza bruta, y bcrypt en
// cada request de un formulario web sería caro para nada.
function hashKey(key: string): string {
  const pepper = process.env.JWT_REFRESH_PEPPER;
  if (!pepper) throw new Error('JWT_REFRESH_PEPPER is not set');
  return createHash('sha256').update(key + pepper).digest('hex');
}

export const IntakeService = {
  async listKeys(actor: Actor) {
    const keys = await prisma.apiKey.findMany({
      where: { tenantId: actor.tenantId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return keys.map((key) => ({
      id: key.id,
      name: key.name,
      lastFour: key.lastFour,
      lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
      createdAt: key.createdAt.toISOString(),
    }));
  },

  /** Devuelve la clave en claro UNA vez. Después solo quedan sus últimos 4 caracteres. */
  async createKey(actor: Actor, name: string) {
    const key = `${PREFIX}${randomBytes(32).toString('hex')}`;
    const row = await prisma.apiKey.create({
      data: {
        tenantId: actor.tenantId,
        name,
        keyHash: hashKey(key),
        lastFour: key.slice(-4),
        createdById: actor.userId,
      },
    });
    await recordAudit(actor, {
      action: 'CREATE',
      entityType: 'USER',
      entityId: row.id,
      // La clave NO va al log. Lo que importa registrar es que alguien creó un acceso externo.
      after: { apiKeyName: name, lastFour: row.lastFour },
    });
    return { id: row.id, name: row.name, lastFour: row.lastFour, key };
  },

  async revokeKey(actor: Actor, id: string) {
    const { count } = await prisma.apiKey.updateMany({
      where: { id, tenantId: actor.tenantId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count === 0) throw new NotFoundError('API key not found');
    await recordAudit(actor, { action: 'DELETE', entityType: 'USER', entityId: id, before: { apiKeyRevoked: true } });
  },

  /**
   * Crea un lead desde afuera, autenticando con la clave en vez de una sesión.
   *
   * Es la puerta de entrada del formulario del sitio. Dos cosas importan acá: que la clave
   * identifique de qué empresa es el lead (si no, un formulario podría cargar leads en la cartera de
   * otro cliente), y que el lead NO nazca asignado a nadie — asignarlo al azar hace que aparezca en
   * la lista de alguien que no sabe de dónde salió.
   */
  async captureLead(rawKey: string, input: z.infer<typeof createLeadSchema>): Promise<LeadDTO> {
    const key = await prisma.apiKey.findUnique({ where: { keyHash: hashKey(rawKey) } });
    if (!key || key.revokedAt) throw new UnauthorizedError('Clave inválida');

    // Marca de uso, para poder ver desde la app si el formulario está enviando o está mudo.
    await prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } });

    const lead = await LeadsRepository.create({
      tenantId: key.tenantId,
      businessName: input.businessName,
      contactName: input.contactName,
      representativeName: input.representativeName,
      phone: input.phone,
      whatsapp: input.whatsapp,
      email: input.email,
      line: input.line,
      billingType: input.billingType,
      // Si no dice de dónde viene, queda como "Web": es el caso por lejos más común y deja el
      // origen usable en el gráfico en vez de un "Sin origen" que no dice nada.
      source: input.source ?? 'Web',
      notes: input.notes,
    });
    return leadToDTO(lead);
  },
};
