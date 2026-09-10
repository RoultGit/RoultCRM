import { z } from 'zod';
import { relatedTypeSchema } from './tasks.js';

export const customFieldTypeSchema = z.enum(['TEXT', 'NUMBER', 'DATE', 'SELECT', 'CHECKBOX']);
export type CustomFieldType = z.infer<typeof customFieldTypeSchema>;

export const FIELD_TYPE_LABEL: Record<CustomFieldType, string> = {
  TEXT: 'Texto',
  NUMBER: 'Número',
  DATE: 'Fecha',
  SELECT: 'Lista de opciones',
  CHECKBOX: 'Sí / No',
};

export const FIELD_TYPE_OPTIONS = (Object.keys(FIELD_TYPE_LABEL) as CustomFieldType[]).map((value) => ({
  value,
  label: FIELD_TYPE_LABEL[value],
}));

export const CUSTOM_FIELD_ENTITIES = [
  { value: 'COMPANY', label: 'Empresas' },
  { value: 'CONTACT', label: 'Contactos' },
  { value: 'LEAD', label: 'Leads' },
  { value: 'DEAL', label: 'Ventas' },
] as const;

export const ENTITY_LABEL: Record<string, string> = Object.fromEntries(
  CUSTOM_FIELD_ENTITIES.map((e) => [e.value, e.label])
);

export const createCustomFieldSchema = z
  .object({
    entity: relatedTypeSchema,
    label: z.string().min(1, 'Ponele un nombre al campo'),
    type: customFieldTypeSchema,
    options: z.array(z.string().min(1)).default([]),
    required: z.boolean().default(false),
  })
  // Una lista sin opciones es un desplegable vacío: no se puede elegir nada y el campo queda
  // inservible sin que nada avise.
  .refine((v) => v.type !== 'SELECT' || v.options.length > 0, {
    message: 'Una lista necesita al menos una opción',
    path: ['options'],
  });

export const updateCustomFieldSchema = z.object({
  label: z.string().min(1).optional(),
  options: z.array(z.string().min(1)).optional(),
  required: z.boolean().optional(),
  position: z.number().int().min(0).optional(),
  // Archivar en vez de borrar: los valores ya cargados se conservan y el campo puede volver.
  archived: z.boolean().optional(),
});

// Los valores llegan como un mapa de fieldId a texto. Vacío significa "sin dato" y borra el valor.
export const setCustomValuesSchema = z.object({
  entity: relatedTypeSchema,
  recordId: z.string().min(1),
  values: z.record(z.string(), z.string()),
});

export interface CustomFieldDTO {
  id: string;
  entity: z.infer<typeof relatedTypeSchema>;
  label: string;
  type: CustomFieldType;
  options: string[];
  required: boolean;
  position: number;
  archivedAt: string | null;
}

export interface CustomValuesDTO {
  entity: z.infer<typeof relatedTypeSchema>;
  recordId: string;
  /** fieldId → valor. Solo trae los que tienen algo cargado. */
  values: Record<string, string>;
}
