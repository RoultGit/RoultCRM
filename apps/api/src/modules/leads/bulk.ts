import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { ValidationError, ForbiddenError } from '../../lib/errors.js';
import { ownerFilter, type Actor } from '../../lib/scope.js';
import { recordAudit } from '../../lib/audit.js';

/** Tope por operación. Reasignar de a mil de una vez es casi siempre un clic equivocado. */
const MAX_IDS = 200;

export const bulkAssignSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, 'Elegí al menos uno').max(MAX_IDS),
  assignedUserId: z.string().nullable(),
});

export const bulkStatusSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(MAX_IDS),
  status: z.enum(['NEW', 'CONTACTED', 'QUALIFIED', 'UNQUALIFIED', 'LOST']),
});

export interface BulkResult {
  updated: number;
}

/**
 * Cambios sobre varios leads de una vez.
 *
 * El alcance se aplica en el UPDATE y no antes: filtrando en memoria, un vendedor podría mandar los
 * ids de la cartera de un colega y el update los tomaría igual. Acá, los ids que no son suyos
 * simplemente no matchean y el resultado dice cuántos se tocaron de verdad.
 */
export const LeadsBulk = {
  async assign(actor: Actor, input: z.infer<typeof bulkAssignSchema>): Promise<BulkResult> {
    // Reasignar la cartera de otro es del administrador: un vendedor solo puede tomar para sí.
    if (actor.role !== 'ADMIN' && input.assignedUserId !== actor.userId) {
      throw new ForbiddenError('Solo un administrador puede asignarle leads a otra persona');
    }
    if (input.assignedUserId) {
      const existe = await prisma.user.findFirst({
        where: { id: input.assignedUserId, tenantId: actor.tenantId, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!existe) throw new ValidationError('Esa persona no está en tu equipo');
    }

    const { count } = await prisma.lead.updateMany({
      where: { id: { in: input.ids }, tenantId: actor.tenantId, ...ownerFilter(actor) },
      data: { assignedUserId: input.assignedUserId },
    });

    if (count > 0) {
      await recordAudit(actor, {
        action: 'ASSIGN',
        entityType: 'LEAD',
        // Es una operación sobre muchos: se registra una línea con el detalle en vez de una por
        // lead, que llenaría la auditoría y no diría nada más.
        entityId: `bulk:${count}`,
        after: { ids: input.ids.slice(0, 50), assignedUserId: input.assignedUserId, count },
      });
    }
    return { updated: count };
  },

  async setStatus(actor: Actor, input: z.infer<typeof bulkStatusSchema>): Promise<BulkResult> {
    const { count } = await prisma.lead.updateMany({
      where: { id: { in: input.ids }, tenantId: actor.tenantId, ...ownerFilter(actor) },
      data: { status: input.status },
    });
    if (count > 0) {
      await recordAudit(actor, {
        action: 'STATUS_CHANGE',
        entityType: 'LEAD',
        entityId: `bulk:${count}`,
        after: { ids: input.ids.slice(0, 50), status: input.status, count },
      });
    }
    return { updated: count };
  },
};
