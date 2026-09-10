import type { ActivityDTO, createActivitySchema } from '@roult/shared';
import type { z } from 'zod';
import type { Activity, RelatedType } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { NotFoundError } from '../../lib/errors.js';
import { ownerFilter, type Actor } from '../../lib/scope.js';

function toDTO(activity: Activity): ActivityDTO {
  return {
    id: activity.id,
    authorId: activity.authorId,
    relatedType: activity.relatedType,
    relatedId: activity.relatedId,
    type: activity.type,
    body: activity.body,
    occurredAt: activity.occurredAt.toISOString(),
    createdAt: activity.createdAt.toISOString(),
  };
}

/**
 * ¿Puede este actor ver el registro al que se le quiere colgar la interacción?
 *
 * Es la pieza que sostiene todo el aislamiento de este módulo. La tabla Activity guarda un
 * relatedType + relatedId sueltos, sin clave foránea: si no se preguntara por el registro dueño,
 * cualquiera con un id podría leer o escribir la historia de un cliente ajeno. Se resuelve
 * preguntándole al registro real, con el mismo scoping que usa su propia pantalla.
 *
 * El contacto NO tiene dueño propio: hereda el de su empresa, que es de quien depende.
 */
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

  // 404 y no 403: decir "existe pero no es tuyo" ya revela que ese cliente existe en la empresa.
  if (!found) throw new NotFoundError('Record not found');
}

export const ActivitiesService = {
  async list(actor: Actor, relatedType: RelatedType, relatedId: string): Promise<ActivityDTO[]> {
    await assertCanSee(actor, relatedType, relatedId);
    const activities = await prisma.activity.findMany({
      where: { tenantId: actor.tenantId, relatedType, relatedId },
      // De lo más reciente a lo más viejo, y por cuándo PASÓ, no por cuándo se cargó.
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
    });
    return activities.map(toDTO);
  },

  async create(actor: Actor, input: z.infer<typeof createActivitySchema>): Promise<ActivityDTO> {
    await assertCanSee(actor, input.relatedType, input.relatedId);

    const activity = await prisma.activity.create({
      data: {
        tenantId: actor.tenantId,
        // El autor sale del token, nunca del body: si no, cualquiera podría firmar con otro nombre
        // una llamada que no hizo.
        authorId: actor.userId,
        relatedType: input.relatedType,
        relatedId: input.relatedId,
        type: input.type,
        body: input.body,
        occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
      },
    });
    return toDTO(activity);
  },
};
