import {
  AUTOMATION_CATALOG,
  automationCodeSchema,
  defaultConfig,
  parseConfig,
  type AutomationCode,
  type AutomationDTO,
  type AutomationRunDTO,
  type updateAutomationSchema,
} from '@roult/shared';
import type { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { ForbiddenError, ValidationError } from '../../lib/errors.js';
import type { Actor } from '../../lib/scope.js';

export const AutomationsService = {
  /**
   * Las seis del catálogo, siempre.
   *
   * Una automatización que nadie tocó no tiene fila en la base: se devuelve apagada y con los
   * valores de fábrica. Así la pantalla no depende de que alguien haya sembrado nada.
   */
  async list(actor: Actor): Promise<AutomationDTO[]> {
    const filas = await prisma.automation.findMany({ where: { tenantId: actor.tenantId } });
    const porCodigo = new Map(filas.map((fila) => [fila.code as AutomationCode, fila]));

    return AUTOMATION_CATALOG.map((spec) => {
      const fila = porCodigo.get(spec.code);
      return {
        code: spec.code,
        enabled: fila?.enabled ?? false,
        config: fila ? parseConfig(spec.code, fila.config) : defaultConfig(spec.code),
      };
    });
  },

  async update(
    actor: Actor,
    code: string,
    input: z.infer<typeof updateAutomationSchema>
  ): Promise<AutomationDTO> {
    // Prender una automatización cambia el trabajo de todo el equipo: no es del vendedor.
    if (actor.role !== 'ADMIN') throw new ForbiddenError('Solo un administrador puede cambiar las automatizaciones');

    const parsed = automationCodeSchema.safeParse(code);
    if (!parsed.success) throw new ValidationError('Esa automatización no existe');
    const codigo = parsed.data;

    const actual = await prisma.automation.findUnique({
      where: { tenantId_code: { tenantId: actor.tenantId, code: codigo } },
    });

    // La config se pasa por el catálogo antes de guardarse: entra como JSON libre y sin esto
    // cualquiera podría meter lo que quisiera adentro de la fila.
    const config = parseConfig(codigo, {
      ...(actual ? (actual.config as Record<string, unknown>) : defaultConfig(codigo)),
      ...(input.config ?? {}),
    });
    const enabled = input.enabled ?? actual?.enabled ?? false;

    await prisma.automation.upsert({
      where: { tenantId_code: { tenantId: actor.tenantId, code: codigo } },
      create: { tenantId: actor.tenantId, code: codigo, enabled, config },
      update: { enabled, config },
    });

    return { code: codigo, enabled, config };
  },

  /** Lo último que hicieron, para que se vea que están trabajando. */
  async runs(actor: Actor, limit = 20): Promise<AutomationRunDTO[]> {
    const filas = await prisma.automationRun.findMany({
      where: { tenantId: actor.tenantId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 100),
    });
    return filas.map((fila) => ({
      code: fila.code as AutomationCode,
      targetType: fila.targetType,
      targetId: fila.targetId,
      detail: fila.detail,
      createdAt: fila.createdAt.toISOString(),
    }));
  },
};
