import type { LeadDTO, CompanyDTO, ContactDTO, createLeadSchema, updateLeadSchema, setLeadStatusSchema } from '@ventry/shared';
import type { z } from 'zod';
import type { Lead } from '@prisma/client';
import { LeadsRepository, type LeadFilters } from './leads.repository.js';
import { UsersRepository } from '../users/users.repository.js';
import { CompaniesRepository } from '../companies/companies.repository.js';
import { toDTO as companyToDTO } from '../companies/companies.service.js';
import { ContactsRepository } from '../contacts/contacts.repository.js';
import { toDTO as contactToDTO } from '../contacts/contacts.service.js';
import { AppError, NotFoundError, ValidationError, DuplicateError, ForbiddenError } from '../../lib/errors.js';
import { ownerFilter, defaultAssignee, canSee, type Actor } from '../../lib/scope.js';
import { prisma } from '../../lib/prisma.js';

export function toDTO(lead: Lead): LeadDTO {
  return {
    id: lead.id,
    businessName: lead.businessName,
    contactName: lead.contactName,
    phone: lead.phone,
    whatsapp: lead.whatsapp,
    email: lead.email,
    line: lead.line,
    source: lead.source,
    assignedUserId: lead.assignedUserId,
    status: lead.status,
    notes: lead.notes,
    convertedCompanyId: lead.convertedCompanyId,
    convertedAt: lead.convertedAt?.toISOString() ?? null,
    createdAt: lead.createdAt.toISOString(),
    updatedAt: lead.updatedAt.toISOString(),
  };
}

async function assertAssignedUserValid(tenantId: string, assignedUserId?: string) {
  if (!assignedUserId) return;
  const user = await UsersRepository.findByIdAndTenant(assignedUserId, tenantId);
  if (!user) throw new NotFoundError('Assigned user not found');
}

export const LeadsService = {
  async list(actor: Actor, filters: LeadFilters = {}): Promise<LeadDTO[]> {
    const leads = await LeadsRepository.findManyByTenant(actor.tenantId, ownerFilter(actor), filters);
    return leads.map(toDTO);
  },

  async create(actor: Actor, input: z.infer<typeof createLeadSchema>): Promise<LeadDTO> {
    const assignedUserId = defaultAssignee(actor, input.assignedUserId);
    // Solo se valida lo que vino del request. El id del propio actor sale de un JWT firmado de un
    // usuario real, chequearlo contra la base es redundante; y para un VENDEDOR el assignedUserId
    // del body se descarta antes de llegar acá, así que tampoco hay nada que validar.
    if (actor.role === 'ADMIN') await assertAssignedUserValid(actor.tenantId, input.assignedUserId);
    const lead = await LeadsRepository.create({
      tenantId: actor.tenantId,
      businessName: input.businessName,
      contactName: input.contactName,
      phone: input.phone,
      whatsapp: input.whatsapp,
      email: input.email,
      line: input.line,
      source: input.source,
      assignedUserId,
      notes: input.notes,
    });
    return toDTO(lead);
  },

  async update(actor: Actor, id: string, input: z.infer<typeof updateLeadSchema>): Promise<LeadDTO> {
    const existing = await LeadsRepository.findByIdAndTenant(id, actor.tenantId, ownerFilter(actor));
    if (!existing) throw new NotFoundError('Lead not found');
    if (input.assignedUserId !== undefined && actor.role !== 'ADMIN') {
      throw new ForbiddenError('Solo un administrador puede reasignar un lead');
    }
    await assertAssignedUserValid(actor.tenantId, input.assignedUserId);
    await LeadsRepository.updateByIdAndTenant(id, actor.tenantId, input);
    const updated = await LeadsRepository.findByIdAndTenant(id, actor.tenantId);
    return toDTO(updated!);
  },

  async setStatus(actor: Actor, id: string, status: z.infer<typeof setLeadStatusSchema>['status']): Promise<LeadDTO> {
    const existing = await LeadsRepository.findByIdAndTenant(id, actor.tenantId, ownerFilter(actor));
    if (!existing) throw new NotFoundError('Lead not found');
    if (existing.status === 'CONVERTED') throw new ValidationError('Cannot change the status of a converted lead');
    await LeadsRepository.updateStatus(id, actor.tenantId, status);
    const updated = await LeadsRepository.findByIdAndTenant(id, actor.tenantId);
    return toDTO(updated!);
  },

  async convert(
    actor: Actor,
    id: string,
    confirmDuplicate: boolean
  ): Promise<{ lead: LeadDTO; company: CompanyDTO; contact: ContactDTO }> {
    const tenantId = actor.tenantId;
    const lead = await LeadsRepository.findByIdAndTenant(id, tenantId, ownerFilter(actor));
    if (!lead) throw new NotFoundError('Lead not found');
    if (lead.status === 'CONVERTED') throw new ValidationError('Lead is already converted');

    if (!confirmDuplicate) {
      const duplicateCompany = await CompaniesRepository.findPossibleDuplicate(tenantId, {
        name: lead.businessName,
        email: lead.email ?? undefined,
        whatsapp: lead.whatsapp ?? undefined,
      });
      if (duplicateCompany) {
        throw canSee(actor, duplicateCompany)
          ? new DuplicateError(companyToDTO(duplicateCompany))
          : new AppError(
              'Ya existe una empresa parecida asignada a otro vendedor. Pedile a un administrador que te la asigne.',
              409
            );
      }
    }

    // Wrapped in a transaction so the three writes commit or roll back together, and the final
    // markConverted's `status: { not: 'CONVERTED' }` guard makes double-conversion impossible even
    // if two convert requests for the same lead race each other: whichever transaction commits
    // second finds 0 rows to update and rolls back its own Company/Contact inserts too.
    const { company, contact } = await prisma.$transaction(async (tx) => {
      const company = await CompaniesRepository.create(
        {
          tenantId,
          name: lead.businessName,
          line: lead.line,
          whatsapp: lead.whatsapp,
          email: lead.email,
          source: lead.source,
          assignedUserId: lead.assignedUserId,
        },
        tx
      );

      const contact = await ContactsRepository.create(
        {
          tenantId,
          companyId: company.id,
          name: lead.contactName,
          phone: lead.phone,
          whatsapp: lead.whatsapp,
          email: lead.email,
        },
        tx
      );

      const claimed = await LeadsRepository.markConverted(id, tenantId, company.id, tx);
      if (claimed.count === 0) throw new ValidationError('Lead is already converted');

      return { company, contact };
    });

    const updatedLead = await LeadsRepository.findByIdAndTenant(id, tenantId);
    return { lead: toDTO(updatedLead!), company: companyToDTO(company), contact: contactToDTO(contact) };
  },
};
