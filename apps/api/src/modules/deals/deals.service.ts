import type { DealDTO, createDealSchema, updateDealSchema, setDealStageSchema } from '@ventry/shared';
import type { z } from 'zod';
import type { Deal, Prisma } from '@prisma/client';
import { DealsRepository, type DealFilters } from './deals.repository.js';
import { CompaniesRepository } from '../companies/companies.repository.js';
import { UsersRepository } from '../users/users.repository.js';
import { NotFoundError, ForbiddenError } from '../../lib/errors.js';
import { ownerFilter, defaultAssignee, type Actor } from '../../lib/scope.js';
import { recordAudit } from '../../lib/audit.js';

type DealWithCompany = Deal & { company: { name: string } };

export function toDTO(deal: DealWithCompany): DealDTO {
  return {
    id: deal.id,
    companyId: deal.companyId,
    companyName: deal.company.name,
    title: deal.title,
    amount: deal.amount.toString(),
    currency: deal.currency,
    stage: deal.stage,
    assignedUserId: deal.assignedUserId,
    expectedCloseDate: deal.expectedCloseDate?.toISOString() ?? null,
    lostReason: deal.lostReason,
    nextStepDescription: deal.nextStepDescription,
    nextStepOwnerId: deal.nextStepOwnerId,
    nextStepDate: deal.nextStepDate?.toISOString() ?? null,
    createdAt: deal.createdAt.toISOString(),
    updatedAt: deal.updatedAt.toISOString(),
  };
}

async function assertUserInTenant(tenantId: string, userId?: string) {
  if (!userId) return;
  const user = await UsersRepository.findByIdAndTenant(userId, tenantId);
  if (!user) throw new NotFoundError('Assigned user not found');
}

export const DealsService = {
  async list(actor: Actor, filters: DealFilters = {}): Promise<DealDTO[]> {
    const deals = await DealsRepository.findManyByTenant(actor.tenantId, ownerFilter(actor), filters);
    return deals.map(toDTO);
  },

  async create(actor: Actor, input: z.infer<typeof createDealSchema>): Promise<DealDTO> {
    const company = await CompaniesRepository.findByIdAndTenant(input.companyId, actor.tenantId, ownerFilter(actor));
    if (!company) throw new NotFoundError('Company not found');

    const assignedUserId = defaultAssignee(actor, input.assignedUserId);
    // Solo se valida lo que vino del request. El id del propio actor sale de un JWT firmado de un
    // usuario real, chequearlo contra la base es redundante; y para un VENDEDOR el assignedUserId
    // del body se descarta antes de llegar acá, así que tampoco hay nada que validar.
    if (actor.role === 'ADMIN') await assertUserInTenant(actor.tenantId, input.assignedUserId);
    await assertUserInTenant(actor.tenantId, input.nextStepOwnerId);

    const deal = await DealsRepository.create({
      tenantId: actor.tenantId,
      companyId: input.companyId,
      title: input.title,
      amount: input.amount,
      currency: input.currency,
      assignedUserId,
      expectedCloseDate: input.expectedCloseDate ? new Date(input.expectedCloseDate) : undefined,
      nextStepDescription: input.nextStepDescription,
      nextStepOwnerId: input.nextStepOwnerId,
      nextStepDate: input.nextStepDate ? new Date(input.nextStepDate) : undefined,
    });
    await recordAudit(actor, { action: 'CREATE', entityType: 'DEAL', entityId: deal.id, after: toDTO(deal) as unknown as Prisma.InputJsonValue });
    return toDTO(deal);
  },

  async update(actor: Actor, id: string, input: z.infer<typeof updateDealSchema>): Promise<DealDTO> {
    const existing = await DealsRepository.findByIdAndTenant(id, actor.tenantId, ownerFilter(actor));
    if (!existing) throw new NotFoundError('Deal not found');
    if (input.assignedUserId !== undefined && actor.role !== 'ADMIN') {
      throw new ForbiddenError('Solo un administrador puede reasignar un deal');
    }
    await assertUserInTenant(actor.tenantId, input.nextStepOwnerId);

    // El objeto se arma campo por campo a propósito: updateDealSchema es .partial(), así que un
    // spread del input entero escribiría undefined en columnas que el cliente no mandó, y dejaría
    // pasar un stage o un lostReason sin la validación de setStage.
    await DealsRepository.updateByIdAndTenant(id, actor.tenantId, {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.amount !== undefined ? { amount: input.amount } : {}),
      ...(input.currency !== undefined ? { currency: input.currency } : {}),
      ...(input.assignedUserId !== undefined ? { assignedUserId: input.assignedUserId } : {}),
      ...(input.expectedCloseDate !== undefined ? { expectedCloseDate: new Date(input.expectedCloseDate) } : {}),
      ...(input.nextStepDescription !== undefined ? { nextStepDescription: input.nextStepDescription } : {}),
      ...(input.nextStepOwnerId !== undefined ? { nextStepOwnerId: input.nextStepOwnerId } : {}),
      ...(input.nextStepDate !== undefined ? { nextStepDate: new Date(input.nextStepDate) } : {}),
    });
    const updated = await DealsRepository.findByIdAndTenant(id, actor.tenantId);
    await recordAudit(actor, {
      action: 'UPDATE',
      entityType: 'DEAL',
      entityId: id,
      before: toDTO(existing) as unknown as Prisma.InputJsonValue,
      after: toDTO(updated!) as unknown as Prisma.InputJsonValue,
    });
    return toDTO(updated!);
  },

  async setStage(actor: Actor, id: string, input: z.infer<typeof setDealStageSchema>): Promise<DealDTO> {
    const existing = await DealsRepository.findByIdAndTenant(id, actor.tenantId, ownerFilter(actor));
    if (!existing) throw new NotFoundError('Deal not found');

    await DealsRepository.updateByIdAndTenant(id, actor.tenantId, {
      stage: input.stage,
      // Reabrir un deal perdido tiene que limpiar el motivo, si no queda un texto viejo colgado
      // contradiciendo la etapa nueva.
      lostReason: input.stage === 'PERDIDO' ? input.lostReason! : null,
    });
    const updated = await DealsRepository.findByIdAndTenant(id, actor.tenantId);
    await recordAudit(actor, {
      action: 'STAGE_CHANGE',
      entityType: 'DEAL',
      entityId: id,
      before: { stage: existing.stage, lostReason: existing.lostReason },
      after: { stage: input.stage, lostReason: input.stage === 'PERDIDO' ? input.lostReason! : null },
    });
    return toDTO(updated!);
  },

  // Borrar es para el deal cargado por error (empresa equivocada, monto mal tipeado, duplicado). Un
  // deal que no se cerró NO se borra: se marca PERDIDO, que es un resultado de negocio y tiene que
  // seguir contando en el pipeline y en las métricas. Por eso queda solo para ADMIN: un vendedor
  // podría hacer desaparecer los deals que no le salieron y su tasa de cierre mentiría.
  async remove(actor: Actor, id: string): Promise<void> {
    if (actor.role !== 'ADMIN') throw new ForbiddenError('Solo un administrador puede eliminar un deal');

    const existing = await DealsRepository.findByIdAndTenant(id, actor.tenantId);
    if (!existing) throw new NotFoundError('Deal not found');

    const { count } = await DealsRepository.deleteByIdAndTenant(id, actor.tenantId);
    if (count === 0) throw new NotFoundError('Deal not found');

    // La fila del deal se va, la línea de auditoría queda: AuditLog no tiene FK contra Deal
    // justamente para esto. `before` guarda el DTO entero, que es lo único que va a quedar de este
    // deal, así que después se puede ver qué decía y quién lo borró.
    await recordAudit(actor, {
      action: 'DELETE',
      entityType: 'DEAL',
      entityId: id,
      before: toDTO(existing) as unknown as Prisma.InputJsonValue,
    });
  },

  async assign(actor: Actor, id: string, assignedUserId?: string): Promise<DealDTO> {
    if (actor.role !== 'ADMIN') throw new ForbiddenError('Solo un administrador puede asignar un deal');

    const existing = await DealsRepository.findByIdAndTenant(id, actor.tenantId);
    if (!existing) throw new NotFoundError('Deal not found');
    await assertUserInTenant(actor.tenantId, assignedUserId);

    // Asignarle a alguien el deal que ya tenía no es un evento: no ensucia el historial.
    if (existing.assignedUserId !== (assignedUserId ?? null)) {
      await DealsRepository.updateByIdAndTenant(id, actor.tenantId, { assignedUserId: assignedUserId ?? null });
      await DealsRepository.recordAssignment({
        tenantId: actor.tenantId,
        entityType: 'DEAL',
        entityId: id,
        previousUserId: existing.assignedUserId,
        newUserId: assignedUserId ?? null,
        changedById: actor.userId,
      });
      await recordAudit(actor, {
        action: 'ASSIGN',
        entityType: 'DEAL',
        entityId: id,
        before: { assignedUserId: existing.assignedUserId },
        after: { assignedUserId: assignedUserId ?? null },
      });
    }

    const updated = await DealsRepository.findByIdAndTenant(id, actor.tenantId);
    return toDTO(updated!);
  },
};
