import type { CompanyDTO, createCompanySchema, updateCompanySchema } from '@roult/shared';
import type { z } from 'zod';
import type { Company, Prisma } from '@prisma/client';
import { CompaniesRepository, type CompanyFilters } from './companies.repository.js';
import { UsersRepository } from '../users/users.repository.js';
import { AppError, NotFoundError, DuplicateError, ForbiddenError } from '../../lib/errors.js';
import { ownerFilter, defaultAssignee, canSee, type Actor } from '../../lib/scope.js';
import { recordAudit } from '../../lib/audit.js';

export function toDTO(company: Company): CompanyDTO {
  return {
    id: company.id,
    name: company.name,
    representativeName: company.representativeName,
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
      representativeName: input.representativeName,
      line: input.line,
      city: input.city,
      source: input.source,
      whatsapp: input.whatsapp,
      email: input.email,
      assignedUserId,
      notes: input.notes,
    });
    await recordAudit(actor, { action: 'CREATE', entityType: 'COMPANY', entityId: company.id, after: toDTO(company) as unknown as Prisma.InputJsonValue });
    return toDTO(company);
  },

  /**
   * Eliminar es para la empresa cargada por error: nombre mal escrito, duplicada, creada sobre el
   * cliente equivocado. NO es la salida para un cliente que se perdió — para eso está marcar sus
   * ventas como Perdidas, que conserva el historial.
   *
   * Solo ADMIN. Es justamente el caso "un empleado se equivocó": el que se equivoca es el vendedor
   * y el que arregla es quien manda.
   */
  async remove(actor: Actor, id: string): Promise<{ contactsDeleted: number }> {
    if (actor.role !== 'ADMIN') throw new ForbiddenError('Solo un administrador puede eliminar una empresa');

    const existing = await CompaniesRepository.findByIdAndTenant(id, actor.tenantId);
    if (!existing) throw new NotFoundError('Company not found');

    // Una empresa con ventas no es un error de tipeo: tiene plata e historia detrás. Borrarla se
    // llevaría puestos el pipeline, el dashboard y las comisiones sin dejar rastro de cuánto se
    // vendió. Se frena y se dice cuántas ventas hay, para que la decisión sea sobre las ventas.
    const deals = await CompaniesRepository.countDeals(id, actor.tenantId);
    if (deals > 0) {
      throw new AppError(
        `No se puede eliminar: la empresa tiene ${deals} ${deals === 1 ? 'venta asociada' : 'ventas asociadas'}. ` +
          'Eliminá o reasigná esas ventas primero.',
        409
      );
    }

    const { companies, contacts } = await CompaniesRepository.deleteWithDependents(id, actor.tenantId);
    if (companies === 0) throw new NotFoundError('Company not found');

    // Lo borrado tiene que seguir siendo reconstruible: AuditLog no tiene FK contra Company
    // justamente para esto, y `before` guarda el DTO entero.
    await recordAudit(actor, {
      action: 'DELETE',
      entityType: 'COMPANY',
      entityId: id,
      before: { ...toDTO(existing), contactsDeleted: contacts } as unknown as Prisma.InputJsonValue,
    });
    return { contactsDeleted: contacts };
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
    await recordAudit(actor, {
      action: 'UPDATE',
      entityType: 'COMPANY',
      entityId: id,
      before: toDTO(existing) as unknown as Prisma.InputJsonValue,
      after: toDTO(updated!) as unknown as Prisma.InputJsonValue,
    });
    return toDTO(updated!);
  },
};
