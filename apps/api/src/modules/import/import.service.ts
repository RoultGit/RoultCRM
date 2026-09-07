import {
  createCompanySchema,
  createContactSchema,
  createLeadSchema,
  type ImportCommitDTO,
  type ImportPreviewDTO,
  type ImportRowResult,
  type ImportableEntity,
} from '@ventry/shared';
import type { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { CompaniesRepository } from '../companies/companies.repository.js';
import { ContactsRepository } from '../contacts/contacts.repository.js';
import { LeadsRepository } from '../leads/leads.repository.js';
import { ValidationError } from '../../lib/errors.js';
import { recordAudit, type AuditEntity } from '../../lib/audit.js';
import type { Actor } from '../../lib/scope.js';

const SCHEMAS = {
  companies: createCompanySchema.omit({ confirmDuplicate: true }),
  contacts: createContactSchema.omit({ confirmDuplicate: true }),
  leads: createLeadSchema,
} as const;

const ENTITY_TYPE: Record<ImportableEntity, AuditEntity> = {
  companies: 'COMPANY',
  contacts: 'CONTACT',
  leads: 'LEAD',
};

// Devuelve el registro que ya existe, o null. Reusa la misma detección de duplicados que usan los
// formularios, así que importar y cargar a mano dan el mismo veredicto.
async function findDuplicate(entity: ImportableEntity, tenantId: string, data: Record<string, unknown>) {
  if (entity === 'companies') {
    return CompaniesRepository.findPossibleDuplicate(tenantId, {
      name: data.name as string,
      email: data.email as string | undefined,
      whatsapp: data.whatsapp as string | undefined,
    });
  }
  if (entity === 'contacts') {
    return ContactsRepository.findPossibleDuplicate(tenantId, {
      companyId: data.companyId as string,
      name: data.name as string,
      email: data.email as string | undefined,
      phone: data.phone as string | undefined,
      whatsapp: data.whatsapp as string | undefined,
    });
  }
  const existing = await LeadsRepository.findManyByTenant(tenantId);
  return existing.find((lead) => lead.businessName.toLowerCase() === String(data.businessName).toLowerCase()) ?? null;
}

function issuesToMessage(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
}

export const ImportService = {
  async preview(actor: Actor, entity: ImportableEntity, rows: Record<string, string>[]): Promise<ImportPreviewDTO> {
    const schema = SCHEMAS[entity] as z.ZodTypeAny;
    const results: ImportRowResult[] = [];

    for (const [index, row] of rows.entries()) {
      const parsed = schema.safeParse(row);
      if (!parsed.success) {
        results.push({ index, status: 'INVALID', message: issuesToMessage(parsed.error), data: row });
        continue;
      }
      // ponytail: una consulta de duplicados por fila. Con el tope de 1000 filas y una importación
      // que pasa una vez por migración, alcanza; si algún día se importan decenas de miles, hay que
      // traer los candidatos en una sola consulta y comparar en memoria.
      const duplicate = await findDuplicate(entity, actor.tenantId, parsed.data);
      results.push({
        index,
        status: duplicate ? 'DUPLICATE' : 'NEW',
        message: duplicate ? 'Ya existe un registro parecido' : null,
        data: row,
      });
    }

    return {
      rows: results,
      summary: {
        new: results.filter((r) => r.status === 'NEW').length,
        duplicate: results.filter((r) => r.status === 'DUPLICATE').length,
        invalid: results.filter((r) => r.status === 'INVALID').length,
      },
    };
  },

  async commit(
    actor: Actor,
    entity: ImportableEntity,
    rows: Record<string, string>[],
    skipIndexes: number[]
  ): Promise<ImportCommitDTO> {
    const skip = new Set(skipIndexes);
    const schema = SCHEMAS[entity] as z.ZodTypeAny;

    // Se valida TODO antes de escribir nada. Validar y escribir fila por fila dejaría la mitad de la
    // migración adentro y la otra mitad afuera, que es el peor estado posible: nadie sabe qué entró
    // y volver a correr el archivo duplica lo que sí pasó.
    const toCreate: Record<string, unknown>[] = [];
    for (const [index, row] of rows.entries()) {
      if (skip.has(index)) continue;
      const parsed = schema.safeParse(row);
      if (!parsed.success) {
        throw new ValidationError(`Fila ${index + 1}: ${issuesToMessage(parsed.error)}`);
      }
      toCreate.push(parsed.data);
    }

    // Una sola transacción para todas las filas: o entra el archivo entero, o no entra nada.
    const created = await prisma.$transaction(async (tx) => {
      const ids: string[] = [];
      for (const data of toCreate) {
        // Se descarta cualquier assignedUserId que venga en el archivo. Validar contra qué usuario
        // apunta cada fila sería una consulta más por fila, y un id de otro tenant se escribiría sin
        // que nadie lo note. El admin asigna después desde la columna Vendedor de la tabla.
        const { assignedUserId: _fromFile, ...clean } = data;
        // El tenantId va ÚLTIMO para que gane siempre: un CSV con una columna "tenantId" no puede
        // escribir en el tenant de otro.
        const payload = { ...clean, tenantId: actor.tenantId };
        if (entity === 'companies') {
          ids.push((await CompaniesRepository.create(payload as Prisma.CompanyUncheckedCreateInput, tx)).id);
        } else if (entity === 'contacts') {
          ids.push((await ContactsRepository.create(payload as Prisma.ContactUncheckedCreateInput, tx)).id);
        } else {
          ids.push((await LeadsRepository.create(payload as Prisma.LeadUncheckedCreateInput, tx)).id);
        }
      }
      return ids;
    });

    // La auditoría va fuera de la transacción a propósito: recordAudit se traga sus errores para no
    // tumbar la operación, así que meterlo adentro solo alargaría la transacción sin ganar nada.
    for (const id of created) {
      await recordAudit(actor, {
        action: 'CREATE',
        entityType: ENTITY_TYPE[entity],
        entityId: id,
        after: { imported: true },
      });
    }

    return { created: created.length };
  },
};
