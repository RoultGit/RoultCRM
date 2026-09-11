import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { NotFoundError, ValidationError, ForbiddenError } from '../../lib/errors.js';
import { ownerFilter, type Actor } from '../../lib/scope.js';
import { recordAudit } from '../../lib/audit.js';

export const mergeCompaniesSchema = z.object({
  /** La que queda. */
  keepId: z.string().min(1),
  /** La que se absorbe y desaparece. */
  mergeId: z.string().min(1),
});

export interface MergeResult {
  moved: { contacts: number; deals: number; quotes: number; activities: number; attachments: number; leads: number };
}

/**
 * Fusiona dos fichas del mismo cliente en una.
 *
 * El CRM ya avisaba de los duplicados pero no los podía unir, así que la única salida era borrar
 * una —perdiendo su historia— o convivir con las dos y que cada vendedor mirara la mitad de la
 * verdad.
 *
 * Nada se borra hasta que todo se movió, y todo se mueve en una transacción: a mitad de camino, la
 * historia quedaría repartida entre una ficha viva y una muerta.
 */
export async function mergeCompanies(actor: Actor, input: z.infer<typeof mergeCompaniesSchema>): Promise<MergeResult> {
  // Fusionar toca dos carteras a la vez y borra una ficha: es del administrador.
  if (actor.role !== 'ADMIN') throw new ForbiddenError('Solo un administrador puede fusionar clientes');
  if (input.keepId === input.mergeId) throw new ValidationError('Son la misma ficha');

  const { tenantId } = actor;
  const owner = ownerFilter(actor);
  const [queda, absorbida] = await Promise.all([
    prisma.company.findFirst({ where: { id: input.keepId, tenantId, ...owner } }),
    prisma.company.findFirst({ where: { id: input.mergeId, tenantId, ...owner } }),
  ]);
  if (!queda || !absorbida) throw new NotFoundError('Company not found');

  const moved = await prisma.$transaction(async (tx) => {
    const contacts = (await tx.contact.updateMany({ where: { companyId: absorbida.id }, data: { companyId: queda.id } })).count;
    const deals = (await tx.deal.updateMany({ where: { companyId: absorbida.id }, data: { companyId: queda.id } })).count;
    const quotes = (await tx.quote.updateMany({ where: { companyId: absorbida.id }, data: { companyId: queda.id } })).count;
    // Lead.convertedCompanyId apunta a la ficha que se creó al convertirlo: si quedara apuntando a
    // la absorbida, el lead diría que se convirtió en un cliente que ya no existe.
    const leads = (await tx.lead.updateMany({ where: { convertedCompanyId: absorbida.id }, data: { convertedCompanyId: queda.id } })).count;
    // Estas dos cuelgan por relatedType/relatedId sin clave foránea, así que se mueven a mano.
    const activities = (await tx.activity.updateMany({
      where: { tenantId, relatedType: 'COMPANY', relatedId: absorbida.id },
      data: { relatedId: queda.id },
    })).count;
    const attachments = (await tx.attachment.updateMany({
      where: { tenantId, relatedType: 'COMPANY', relatedId: absorbida.id },
      data: { relatedId: queda.id },
    })).count;
    await tx.customFieldValue.deleteMany({ where: { tenantId, entity: 'COMPANY', recordId: absorbida.id } });

    // Lo que la ficha que queda tenga vacío se completa con lo de la absorbida: fusionar no puede
    // perder el único teléfono que había cargado.
    await tx.company.update({
      where: { id: queda.id },
      data: {
        email: queda.email ?? absorbida.email,
        whatsapp: queda.whatsapp ?? absorbida.whatsapp,
        city: queda.city ?? absorbida.city,
        source: queda.source ?? absorbida.source,
        representativeName: queda.representativeName ?? absorbida.representativeName,
        notes: [queda.notes, absorbida.notes].filter(Boolean).join('\n---\n') || null,
        assignedUserId: queda.assignedUserId ?? absorbida.assignedUserId,
      },
    });

    await tx.company.delete({ where: { id: absorbida.id } });
    return { contacts, deals, quotes, activities, attachments, leads };
  });

  await recordAudit(actor, {
    action: 'DELETE',
    entityType: 'COMPANY',
    entityId: absorbida.id,
    before: { name: absorbida.name },
    after: { fusionadaEn: queda.id, nombreQueQueda: queda.name, movido: moved },
  });

  return { moved };
}
