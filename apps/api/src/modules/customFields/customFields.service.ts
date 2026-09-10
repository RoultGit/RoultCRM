import type {
  CustomFieldDTO,
  CustomValuesDTO,
  createCustomFieldSchema,
  updateCustomFieldSchema,
  setCustomValuesSchema,
} from '@roult/shared';
import type { z } from 'zod';
import type { CustomField, RelatedType } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { NotFoundError, ValidationError, ForbiddenError } from '../../lib/errors.js';
import { ownerFilter, type Actor } from '../../lib/scope.js';

function toDTO(field: CustomField): CustomFieldDTO {
  return {
    id: field.id,
    entity: field.entity,
    label: field.label,
    type: field.type,
    options: field.options,
    required: field.required,
    position: field.position,
    archivedAt: field.archivedAt?.toISOString() ?? null,
  };
}

/**
 * ¿Puede este actor ver la ficha a la que se le quieren cargar valores?
 *
 * Mismo criterio que en las interacciones: la tabla guarda un recordId suelto, sin clave foránea, así
 * que sin preguntar por la ficha real cualquiera con un id podría escribir en la de un cliente ajeno.
 */
async function assertCanSee(actor: Actor, entity: RelatedType, recordId: string): Promise<void> {
  const { tenantId } = actor;
  const owner = ownerFilter(actor);
  const found = await (async () => {
    switch (entity) {
      case 'COMPANY':
        return prisma.company.findFirst({ where: { id: recordId, tenantId, ...owner }, select: { id: true } });
      case 'LEAD':
        return prisma.lead.findFirst({ where: { id: recordId, tenantId, ...owner }, select: { id: true } });
      case 'DEAL':
        return prisma.deal.findFirst({ where: { id: recordId, tenantId, ...owner }, select: { id: true } });
      case 'CONTACT':
        return prisma.contact.findFirst({
          where: { id: recordId, tenantId, company: { ...owner } },
          select: { id: true },
        });
    }
  })();
  if (!found) throw new NotFoundError('Record not found');
}

/**
 * Valida el texto contra el tipo declarado.
 *
 * El valor se guarda siempre como texto, así que esta es la única barrera: sin ella, un campo
 * "Número" termina con "más o menos 30" adentro y cualquier cuenta que lo use da NaN.
 */
function validate(field: CustomField, value: string): void {
  if (value === '') return; // vacío = sin dato, se borra
  switch (field.type) {
    case 'NUMBER':
      if (!/^-?\d+(\.\d+)?$/.test(value)) throw new ValidationError(`"${field.label}" tiene que ser un número`);
      break;
    case 'DATE':
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ValidationError(`"${field.label}" tiene que ser una fecha`);
      break;
    case 'SELECT':
      if (!field.options.includes(value)) {
        throw new ValidationError(`"${value}" no es una opción de "${field.label}"`);
      }
      break;
    case 'CHECKBOX':
      if (value !== 'true' && value !== 'false') {
        throw new ValidationError(`"${field.label}" tiene que ser sí o no`);
      }
      break;
    case 'TEXT':
      break;
  }
}

export const CustomFieldsService = {
  async list(actor: Actor, entity?: RelatedType): Promise<CustomFieldDTO[]> {
    const fields = await prisma.customField.findMany({
      where: { tenantId: actor.tenantId, ...(entity ? { entity } : {}), archivedAt: null },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
    return fields.map(toDTO);
  },

  async create(actor: Actor, input: z.infer<typeof createCustomFieldSchema>): Promise<CustomFieldDTO> {
    if (actor.role !== 'ADMIN') throw new ForbiddenError('Solo un administrador puede definir campos');
    // La posición sale del final: se agrega abajo del formulario, que es donde se espera que
    // aparezca lo recién creado.
    const count = await prisma.customField.count({ where: { tenantId: actor.tenantId, entity: input.entity } });
    const field = await prisma.customField.create({
      data: {
        tenantId: actor.tenantId,
        entity: input.entity,
        label: input.label,
        type: input.type,
        options: input.type === 'SELECT' ? input.options : [],
        required: input.required,
        position: count,
      },
    });
    return toDTO(field);
  },

  async update(actor: Actor, id: string, input: z.infer<typeof updateCustomFieldSchema>): Promise<CustomFieldDTO> {
    if (actor.role !== 'ADMIN') throw new ForbiddenError('Solo un administrador puede editar campos');
    const existing = await prisma.customField.findFirst({ where: { id, tenantId: actor.tenantId } });
    if (!existing) throw new NotFoundError('Custom field not found');

    // El TIPO no se puede cambiar a propósito: pasar un campo con datos de Texto a Número dejaría
    // valores que ya no validan, y no hay forma de convertir "más o menos 30" en un número.
    await prisma.customField.update({
      where: { id },
      data: {
        ...(input.label !== undefined ? { label: input.label } : {}),
        ...(input.options !== undefined && existing.type === 'SELECT' ? { options: input.options } : {}),
        ...(input.required !== undefined ? { required: input.required } : {}),
        ...(input.position !== undefined ? { position: input.position } : {}),
        ...(input.archived !== undefined ? { archivedAt: input.archived ? new Date() : null } : {}),
      },
    });
    const updated = await prisma.customField.findFirstOrThrow({ where: { id } });
    return toDTO(updated);
  },

  async getValues(actor: Actor, entity: RelatedType, recordId: string): Promise<CustomValuesDTO> {
    await assertCanSee(actor, entity, recordId);
    const rows = await prisma.customFieldValue.findMany({
      where: { tenantId: actor.tenantId, entity, recordId },
    });
    return { entity, recordId, values: Object.fromEntries(rows.map((r) => [r.fieldId, r.value])) };
  },

  async setValues(actor: Actor, input: z.infer<typeof setCustomValuesSchema>): Promise<CustomValuesDTO> {
    await assertCanSee(actor, input.entity, input.recordId);

    const ids = Object.keys(input.values);
    const fields = await prisma.customField.findMany({
      where: { id: { in: ids }, tenantId: actor.tenantId, entity: input.entity },
    });
    // Un id que no corresponde a un campo de ESTA empresa y ESTA ficha se rechaza entero: aceptar
    // solo los válidos guardaría a medias sin que nadie se entere.
    if (fields.length !== ids.length) throw new NotFoundError('Custom field not found');
    for (const field of fields) validate(field, input.values[field.id]);

    await prisma.$transaction(
      fields.map((field) => {
        const value = input.values[field.id];
        return value === ''
          ? // Vacío borra la fila en vez de guardar "": así "sin dato" es la ausencia y no un valor
            // que después hay que recordar tratar como especial en cada lectura.
            prisma.customFieldValue.deleteMany({ where: { fieldId: field.id, recordId: input.recordId } })
          : prisma.customFieldValue.upsert({
              where: { fieldId_recordId: { fieldId: field.id, recordId: input.recordId } },
              create: {
                tenantId: actor.tenantId,
                fieldId: field.id,
                entity: input.entity,
                recordId: input.recordId,
                value,
              },
              update: { value },
            });
      })
    );
    return this.getValues(actor, input.entity, input.recordId);
  },
};
