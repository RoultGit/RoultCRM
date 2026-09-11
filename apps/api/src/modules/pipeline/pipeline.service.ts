import {
  STAGE_ORDER,
  DEFAULT_STAGE_LABEL,
  STAGE_MEANING,
  type DealStage,
  type PipelineStageDTO,
  type updatePipelineStageSchema,
} from '@roult/shared';
import type { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { ForbiddenError, ValidationError } from '../../lib/errors.js';
import type { Actor } from '../../lib/scope.js';

export const PipelineService = {
  /**
   * Las ocho etapas, siempre.
   *
   * Una etapa que nadie tocó no tiene fila: se devuelve con su nombre de fábrica. Así la pantalla
   * no depende de que alguien haya sembrado nada al crear la empresa.
   */
  async list(actor: Actor): Promise<PipelineStageDTO[]> {
    const filas = await prisma.pipelineStage.findMany({ where: { tenantId: actor.tenantId } });
    const porEtapa = new Map(filas.map((f) => [f.stage as DealStage, f]));

    return STAGE_ORDER.map((stage, position) => {
      const fila = porEtapa.get(stage);
      return {
        stage,
        label: fila?.label ?? DEFAULT_STAGE_LABEL[stage],
        enabled: fila?.enabled ?? true,
        position: fila?.position ?? position,
        meaning: STAGE_MEANING[stage],
      };
    }).sort((a, b) => a.position - b.position);
  },

  async update(actor: Actor, stage: string, input: z.infer<typeof updatePipelineStageSchema>): Promise<PipelineStageDTO> {
    if (actor.role !== 'ADMIN') throw new ForbiddenError('Solo un administrador puede cambiar las etapas');
    const etapa = STAGE_ORDER.find((s) => s === stage);
    if (!etapa) throw new ValidationError('Esa etapa no existe');

    // Perdido no se esconde: sin ella no habría dónde poner una venta que no salió, y el pipeline
    // mentiría mostrando como abiertas ventas que están muertas.
    if (input.enabled === false && etapa === 'PERDIDO') {
      throw new ValidationError('Perdido no se puede esconder: es donde van las ventas que no salieron.');
    }
    // Y tiene que quedar al menos una etapa ganada, si no el dashboard no tendría dónde contar la
    // plata que entró.
    if (input.enabled === false && STAGE_MEANING[etapa] === 'ganada') {
      const actuales = await this.list(actor);
      const ganadasVivas = actuales.filter((e) => e.meaning === 'ganada' && e.enabled && e.stage !== etapa);
      if (ganadasVivas.length === 0) {
        throw new ValidationError('Tiene que quedar al menos una etapa de venta ganada.');
      }
    }

    const position = STAGE_ORDER.indexOf(etapa);
    const existente = await prisma.pipelineStage.findUnique({
      where: { tenantId_stage: { tenantId: actor.tenantId, stage: etapa } },
    });
    const label = input.label?.trim() || existente?.label || DEFAULT_STAGE_LABEL[etapa];
    const enabled = input.enabled ?? existente?.enabled ?? true;

    await prisma.pipelineStage.upsert({
      where: { tenantId_stage: { tenantId: actor.tenantId, stage: etapa } },
      create: { tenantId: actor.tenantId, stage: etapa, label, enabled, position },
      update: { label, enabled },
    });

    return { stage: etapa, label, enabled, position, meaning: STAGE_MEANING[etapa] };
  },
};
