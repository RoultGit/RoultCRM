import type { DealDTO, createDealSchema, updateDealSchema, setDealStageSchema } from '@ventry/shared';
import type { z } from 'zod';
import type { Deal } from '@prisma/client';
import { DealsRepository } from './deals.repository.js';
import { CompaniesRepository } from '../companies/companies.repository.js';
import { UsersRepository } from '../users/users.repository.js';
import { NotFoundError, ForbiddenError } from '../../lib/errors.js';
import { ownerFilter, defaultAssignee, type Actor } from '../../lib/scope.js';

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
  async list(actor: Actor): Promise<DealDTO[]> {
    const deals = await DealsRepository.findManyByTenant(actor.tenantId, ownerFilter(actor));
    return deals.map(toDTO);
  },

  async create(actor: Actor, input: z.infer<typeof createDealSchema>): Promise<DealDTO> {
    const company = await CompaniesRepository.findByIdAndTenant(input.companyId, actor.tenantId, ownerFilter(actor));
    if (!company) throw new NotFoundError('Company not found');

    const assignedUserId = defaultAssignee(actor, input.assignedUserId);
    await assertUserInTenant(actor.tenantId, assignedUserId);
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
    return toDTO(updated!);
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
    }

    const updated = await DealsRepository.findByIdAndTenant(id, actor.tenantId);
    return toDTO(updated!);
  },
};
