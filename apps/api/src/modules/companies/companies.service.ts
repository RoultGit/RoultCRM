import type { CompanyDTO, createCompanySchema, updateCompanySchema } from '@ventry/shared';
import type { z } from 'zod';
import type { Company } from '@prisma/client';
import { CompaniesRepository } from './companies.repository.js';
import { UsersRepository } from '../users/users.repository.js';
import { NotFoundError, DuplicateError, ForbiddenError } from '../../lib/errors.js';
import { ownerFilter, defaultAssignee, type Actor } from '../../lib/scope.js';

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

async function assertAssignedUserValid(tenantId: string, assignedUserId?: string) {
  if (!assignedUserId) return;
  const user = await UsersRepository.findByIdAndTenant(assignedUserId, tenantId);
  if (!user) throw new NotFoundError('Assigned user not found');
}

export const CompaniesService = {
  async list(actor: Actor): Promise<CompanyDTO[]> {
    const companies = await CompaniesRepository.findManyByTenant(actor.tenantId, ownerFilter(actor));
    return companies.map(toDTO);
  },

  async create(actor: Actor, input: z.infer<typeof createCompanySchema>): Promise<CompanyDTO> {
    const tenantId = actor.tenantId;
    const assignedUserId = defaultAssignee(actor, input.assignedUserId);
    await assertAssignedUserValid(tenantId, assignedUserId);

    if (!input.confirmDuplicate) {
      const duplicate = await CompaniesRepository.findPossibleDuplicate(tenantId, {
        name: input.name,
        email: input.email,
        whatsapp: input.whatsapp,
      });
      if (duplicate) throw new DuplicateError(toDTO(duplicate));
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
