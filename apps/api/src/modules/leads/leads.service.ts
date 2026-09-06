import type { LeadDTO, CompanyDTO, ContactDTO, createLeadSchema, updateLeadSchema, setLeadStatusSchema } from '@ventry/shared';
import type { z } from 'zod';
import type { Lead } from '@prisma/client';
import { LeadsRepository } from './leads.repository.js';
import { CompaniesRepository } from '../companies/companies.repository.js';
import { toDTO as companyToDTO } from '../companies/companies.service.js';
import { ContactsRepository } from '../contacts/contacts.repository.js';
import { toDTO as contactToDTO } from '../contacts/contacts.service.js';
import { NotFoundError, ValidationError, DuplicateError } from '../../lib/errors.js';

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

export const LeadsService = {
  async list(tenantId: string): Promise<LeadDTO[]> {
    const leads = await LeadsRepository.findManyByTenant(tenantId);
    return leads.map(toDTO);
  },

  async create(tenantId: string, input: z.infer<typeof createLeadSchema>): Promise<LeadDTO> {
    const lead = await LeadsRepository.create({
      tenantId,
      businessName: input.businessName,
      contactName: input.contactName,
      phone: input.phone,
      whatsapp: input.whatsapp,
      email: input.email,
      line: input.line,
      source: input.source,
      assignedUserId: input.assignedUserId,
      notes: input.notes,
    });
    return toDTO(lead);
  },

  async update(tenantId: string, id: string, input: z.infer<typeof updateLeadSchema>): Promise<LeadDTO> {
    const existing = await LeadsRepository.findByIdAndTenant(id, tenantId);
    if (!existing) throw new NotFoundError('Lead not found');
    await LeadsRepository.updateByIdAndTenant(id, tenantId, input);
    const updated = await LeadsRepository.findByIdAndTenant(id, tenantId);
    return toDTO(updated!);
  },

  async setStatus(tenantId: string, id: string, status: z.infer<typeof setLeadStatusSchema>['status']): Promise<LeadDTO> {
    const existing = await LeadsRepository.findByIdAndTenant(id, tenantId);
    if (!existing) throw new NotFoundError('Lead not found');
    if (existing.status === 'CONVERTED') throw new ValidationError('Cannot change the status of a converted lead');
    await LeadsRepository.updateStatus(id, tenantId, status);
    const updated = await LeadsRepository.findByIdAndTenant(id, tenantId);
    return toDTO(updated!);
  },

  async convert(
    tenantId: string,
    id: string,
    confirmDuplicate: boolean
  ): Promise<{ lead: LeadDTO; company: CompanyDTO; contact: ContactDTO }> {
    const lead = await LeadsRepository.findByIdAndTenant(id, tenantId);
    if (!lead) throw new NotFoundError('Lead not found');
    if (lead.status === 'CONVERTED') throw new ValidationError('Lead is already converted');

    if (!confirmDuplicate) {
      const duplicateCompany = await CompaniesRepository.findPossibleDuplicate(tenantId, {
        name: lead.businessName,
        email: lead.email ?? undefined,
        whatsapp: lead.whatsapp ?? undefined,
      });
      if (duplicateCompany) throw new DuplicateError(companyToDTO(duplicateCompany));
    }

    const company = await CompaniesRepository.create({
      tenantId,
      name: lead.businessName,
      line: lead.line,
      whatsapp: lead.whatsapp,
      email: lead.email,
      source: lead.source,
      assignedUserId: lead.assignedUserId,
    });

    const contact = await ContactsRepository.create({
      tenantId,
      companyId: company.id,
      name: lead.contactName,
      phone: lead.phone,
      whatsapp: lead.whatsapp,
      email: lead.email,
    });

    await LeadsRepository.markConverted(id, tenantId, company.id);
    const updatedLead = await LeadsRepository.findByIdAndTenant(id, tenantId);

    return { lead: toDTO(updatedLead!), company: companyToDTO(company), contact: contactToDTO(contact) };
  },
};
