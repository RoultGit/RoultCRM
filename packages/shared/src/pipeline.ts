import { z } from 'zod';
import { dealStageSchema } from './deals.js';

export type DealStage = z.infer<typeof dealStageSchema>;

/** Los nombres de fábrica. Sirven para una agencia que vende y entrega, que es el caso base. */
export const DEFAULT_STAGE_LABEL: Record<DealStage, string> = {
  CONTACTO: 'Contacto',
  PROPUESTA: 'Propuesta',
  NEGOCIACION: 'Negociación',
  ADELANTO: 'Adelanto',
  PRODUCCION: 'Producción',
  ENTREGADO: 'Entregado',
  MANTENIMIENTO: 'Mantenimiento',
  PERDIDO: 'Perdido',
};

export const STAGE_ORDER: DealStage[] = [
  'CONTACTO',
  'PROPUESTA',
  'NEGOCIACION',
  'ADELANTO',
  'PRODUCCION',
  'ENTREGADO',
  'MANTENIMIENTO',
  'PERDIDO',
];

/**
 * Lo que cada etapa significa para la plata, y no se puede cambiar.
 *
 * De acá salen "ganado", "en juego" y los gráficos. Si esto fuera configurable, dos empresas
 * tendrían la misma pantalla contando cosas distintas, y nadie podría comparar nada.
 */
export const STAGE_MEANING: Record<DealStage, 'abierta' | 'ganada' | 'perdida'> = {
  CONTACTO: 'abierta',
  PROPUESTA: 'abierta',
  NEGOCIACION: 'abierta',
  ADELANTO: 'ganada',
  PRODUCCION: 'ganada',
  ENTREGADO: 'ganada',
  MANTENIMIENTO: 'ganada',
  PERDIDO: 'perdida',
};

export interface PipelineStageDTO {
  stage: DealStage;
  label: string;
  enabled: boolean;
  position: number;
  /** Para que la pantalla pueda explicar por qué una etapa no se puede esconder. */
  meaning: 'abierta' | 'ganada' | 'perdida';
}

export const updatePipelineStageSchema = z.object({
  label: z.string().min(1, 'Ponele un nombre').max(40).optional(),
  enabled: z.boolean().optional(),
});

/** Las etapas de fábrica, para una empresa que todavía no las tocó. */
export function defaultStages(): PipelineStageDTO[] {
  return STAGE_ORDER.map((stage, position) => ({
    stage,
    label: DEFAULT_STAGE_LABEL[stage],
    enabled: true,
    position,
    meaning: STAGE_MEANING[stage],
  }));
}
