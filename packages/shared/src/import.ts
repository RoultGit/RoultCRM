import { z } from 'zod';

export const importableEntitySchema = z.enum(['companies', 'contacts', 'leads']);
export type ImportableEntity = z.infer<typeof importableEntitySchema>;

export const importPreviewSchema = z.object({
  // Las filas llegan como texto tal cual salieron del CSV; el schema de cada entidad las valida.
  rows: z.array(z.record(z.string(), z.string())).max(1000, 'Máximo 1000 filas por importación'),
});

export const importCommitSchema = importPreviewSchema.extend({
  /** Índices de fila que el usuario desmarcó en la vista previa (duplicados que no quiere traer). */
  skipIndexes: z.array(z.number().int().min(0)).default([]),
});

export type ImportRowStatus = 'NEW' | 'DUPLICATE' | 'INVALID';

export interface ImportRowResult {
  index: number;
  status: ImportRowStatus;
  message: string | null;
  data: Record<string, string>;
}

export interface ImportPreviewDTO {
  rows: ImportRowResult[];
  summary: { new: number; duplicate: number; invalid: number };
}

export interface ImportCommitDTO {
  created: number;
}
