import type { ContactDTO, createContactSchema, updateContactSchema } from '@ventry/shared';
import type { z } from 'zod';
import type { Contact } from '@prisma/client';
import { ContactsRepository } from './contacts.repository.js';
import { CompaniesRepository } from '../companies/companies.repository.js';
import { NotFoundError, DuplicateError } from '../../lib/errors.js';
import { ownerFilter, type Actor } from '../../lib/scope.js';

type ContactWithCompany = Contact & { company: { name: string } };

export function toDTO(contact: ContactWithCompany): ContactDTO {
  return {
    id: contact.id,
    companyId: contact.companyId,
    companyName: contact.company.name,
    name: contact.name,
    position: contact.position,
    phone: contact.phone,
    whatsapp: contact.whatsapp,
    email: contact.email,
    notes: contact.notes,
    createdAt: contact.createdAt.toISOString(),
    updatedAt: contact.updatedAt.toISOString(),
  };
}

export const ContactsService = {
  async list(actor: Actor): Promise<ContactDTO[]> {
    const contacts = await ContactsRepository.findManyByTenant(actor.tenantId, ownerFilter(actor));
    return contacts.map(toDTO);
  },

  async create(actor: Actor, input: z.infer<typeof createContactSchema>): Promise<ContactDTO> {
    const tenantId = actor.tenantId;
    // Scopeado: un vendedor no puede colgarle un contacto a la empresa de otro.
    const company = await CompaniesRepository.findByIdAndTenant(input.companyId, tenantId, ownerFilter(actor));
    if (!company) throw new NotFoundError('Company not found');

    if (!input.confirmDuplicate) {
      const duplicate = await ContactsRepository.findPossibleDuplicate(tenantId, {
        companyId: input.companyId,
        name: input.name,
        email: input.email,
        phone: input.phone,
        whatsapp: input.whatsapp,
      });
      if (duplicate) throw new DuplicateError(toDTO(duplicate));
    }

    const contact = await ContactsRepository.create({
      tenantId,
      companyId: input.companyId,
      name: input.name,
      position: input.position,
      phone: input.phone,
      whatsapp: input.whatsapp,
      email: input.email,
      notes: input.notes,
    });
    return toDTO(contact);
  },

  async update(actor: Actor, id: string, input: z.infer<typeof updateContactSchema>): Promise<ContactDTO> {
    const tenantId = actor.tenantId;
    const existing = await ContactsRepository.findByIdAndTenant(id, tenantId, ownerFilter(actor));
    if (!existing) throw new NotFoundError('Contact not found');
    await ContactsRepository.updateByIdAndTenant(id, tenantId, input);
    const updated = await ContactsRepository.findByIdAndTenant(id, tenantId);
    return toDTO(updated!);
  },
};
