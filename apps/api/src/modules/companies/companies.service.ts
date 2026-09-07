import type { CompanyDTO, createCompanySchema, updateCompanySchema } from '@ventry/shared';
import type { z } from 'zod';
import type { Company } from '@prisma/client';
import { CompaniesRepository, type CompanyFilters } from './companies.repository.js';
import { UsersRepository } from '../users/users.repository.js';
import { AppError, NotFoundError, DuplicateError, ForbiddenError } from '../../lib/errors.js';
import { ownerFilter, defaultAssignee, canSee, type Actor } from '../../lib/scope.js';

export function toDTO(company: Company): CompanyDTO {
  return {
    id: company.id,
    name: company.name,
    line: company.line,
    city: company.city,
    source: company.source,
    whatsapp: company.whatsapp,
    email: company.email,
    assignedUserId: company.assignedUserId,
    notes: company.notes,
    createdAt: company.createdAt.toISOString(),
    updatedAt: company.updatedAt.toISOString(),
  };
}

// El choque se reporta siempre; el registro solo se muestra si el actor podía verlo de todos modos.
function duplicateErrorFor(actor: Actor, duplicate: Company) {
  return canSee(actor, duplicate)
    ? new DuplicateError(toDTO(duplicate))
    : new AppError(
        'Ya existe una empresa parecida asignada a otro vendedor. Pedile a un administrador que te la asigne.',
        409
      );
}

async function assertAssignedUserValid(tenantId: string, assignedUserId?: string) {
  if (!assignedUserId) return;
  const user = await UsersRepository.findByIdAndTenant(assignedUserId, tenantId);
  if (!user) throw new NotFoundError('Assigned user not found');
}

export const CompaniesService = {
  async list(actor: Actor, filters: CompanyFilters = {}): Promise<CompanyDTO[]> {
    const companies = await CompaniesRepository.findManyByTenant(actor.tenantId, ownerFilter(actor), filters);
    return companies.map(toDTO);
  },

  async create(actor: Actor, input: z.infer<typeof createCompanySchema>): Promise<CompanyDTO> {
    const tenantId = actor.tenantId;
    const assignedUserId = defaultAssignee(actor, input.assignedUserId);
    // Solo se valida lo que vino del request. El id del propio actor sale de un JWT firmado de un
    // usuario real, chequearlo contra la base es redundante; y para un VENDEDOR el assignedUserId
    // del body se descarta antes de llegar acá, así que tampoco hay nada que validar.
    if (actor.role === 'ADMIN') await assertAssignedUserValid(tenantId, input.assignedUserId);

    if (!input.confirmDuplicate) {
      const duplicate = await CompaniesRepository.findPossibleDuplicate(tenantId, {
        name: input.name,
        email: input.email,
        whatsapp: input.whatsapp,
      });
      if (duplicate) throw duplicateErrorFor(actor, duplicate);
    }

    const company = await CompaniesRepository.create({
      tenantId,
      name: input.name,
      line: input.line,
      city: input.city,
      source: input.source,
      whatsapp: input.whatsapp,
      email: input.email,
      assignedUserId,
      notes: input.notes,
    });
    return toDTO(company);
  },

  async update(actor: Actor, id: string, input: z.infer<typeof updateCompanySchema>): Promise<CompanyDTO> {
    const tenantId = actor.tenantId;
    const existing = await CompaniesRepository.findByIdAndTenant(id, tenantId, ownerFilter(actor));
    if (!existing) throw new NotFoundError('Company not found');
    if (input.assignedUserId !== undefined && actor.role !== 'ADMIN') {
      throw new ForbiddenError('Solo un administrador puede reasignar una empresa');
    }
    await assertAssignedUserValid(tenantId, input.assignedUserId);
    await CompaniesRepository.updateByIdAndTenant(id, tenantId, input);
    const updated = await CompaniesRepository.findByIdAndTenant(id, tenantId);
    return toDTO(updated!);
  },
};
