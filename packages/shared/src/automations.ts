import { z } from 'zod';

export const automationCodeSchema = z.enum([
  'DEAL_STALE',
  'DEAL_STAGE_TASK_PROPUESTA',
  'DEAL_STAGE_TASK_ENTREGADO',
  'LEAD_AUTO_ASSIGN',
  'LEAD_UNTOUCHED',
  'TASK_OVERDUE_ESCALATE',
  'INSTALLMENT_OVERDUE',
]);
export type AutomationCode = z.infer<typeof automationCodeSchema>;

/** Un parámetro que el dueño puede ajustar desde la pantalla. */
export interface AutomationParam {
  key: string;
  label: string;
  type: 'number' | 'text';
  default: number | string;
  min?: number;
  max?: number;
}

export interface AutomationSpec {
  code: AutomationCode;
  name: string;
  /** Qué hace, en una frase, con {llaves} donde van los parámetros. */
  description: string;
  /** EVENT corre en el momento del cambio; SCHEDULED, en la pasada de la mañana. */
  kind: 'EVENT' | 'SCHEDULED';
  params: AutomationParam[];
}

/**
 * El catálogo cerrado.
 *
 * Acá vive lo que se le muestra a la persona; la ejecución vive en el servidor. Se eligió un
 * catálogo y no un constructor libre a propósito: quien maneja una ferretería prende un
 * interruptor, no arma un diagrama de flujo.
 */
export const AUTOMATION_CATALOG: AutomationSpec[] = [
  {
    code: 'DEAL_STALE',
    name: 'Venta quieta',
    description: 'Si una venta no se mueve en {dias} días, crear una tarea para que el vendedor la retome.',
    kind: 'SCHEDULED',
    params: [{ key: 'dias', label: 'Días sin movimiento', type: 'number', default: 14, min: 1, max: 365 }],
  },
  {
    code: 'DEAL_STAGE_TASK_PROPUESTA',
    name: 'Tarea al pasar a Propuesta',
    description: 'Cuando una venta llega a Propuesta, crear la tarea "{titulo}" con vencimiento en {dias} días.',
    kind: 'EVENT',
    params: [
      { key: 'titulo', label: 'Título de la tarea', type: 'text', default: 'Mandar la cotización' },
      { key: 'dias', label: 'Días para vencer', type: 'number', default: 2, min: 0, max: 365 },
    ],
  },
  {
    code: 'DEAL_STAGE_TASK_ENTREGADO',
    name: 'Seguimiento después de entregar',
    description: 'Cuando una venta llega a Entregado, crear la tarea "{titulo}" con vencimiento en {dias} días.',
    kind: 'EVENT',
    params: [
      { key: 'titulo', label: 'Título de la tarea', type: 'text', default: 'Llamar al cliente para ver cómo va' },
      { key: 'dias', label: 'Días para vencer', type: 'number', default: 30, min: 0, max: 365 },
    ],
  },
  {
    code: 'LEAD_AUTO_ASSIGN',
    name: 'Repartir los leads nuevos',
    description: 'Asignar cada lead que entra sin dueño al vendedor que menos leads abiertos tenga.',
    kind: 'EVENT',
    params: [],
  },
  {
    code: 'LEAD_UNTOUCHED',
    name: 'Lead sin tocar',
    description: 'Si un lead sigue en Nuevo después de {dias} días, crear una tarea para el administrador.',
    kind: 'SCHEDULED',
    params: [{ key: 'dias', label: 'Días sin tocar', type: 'number', default: 3, min: 1, max: 365 }],
  },
  {
    code: 'TASK_OVERDUE_ESCALATE',
    name: 'Escalar tarea vencida',
    description: 'Si una tarea lleva {dias} días vencida, crear una tarea para el administrador.',
    kind: 'SCHEDULED',
    params: [{ key: 'dias', label: 'Días de atraso', type: 'number', default: 7, min: 1, max: 365 }],
  },
  {
    code: 'INSTALLMENT_OVERDUE',
    name: 'Cobrar lo vencido',
    description: 'Si una cuota lleva {dias} días vencida, crear una tarea de cobranza para el vendedor.',
    kind: 'SCHEDULED',
    params: [{ key: 'dias', label: 'Días de atraso', type: 'number', default: 3, min: 0, max: 365 }],
  },
];

export const AUTOMATION_SPEC: Record<AutomationCode, AutomationSpec> = Object.fromEntries(
  AUTOMATION_CATALOG.map((spec) => [spec.code, spec])
) as Record<AutomationCode, AutomationSpec>;

/** Los valores por defecto del catálogo, para una automatización que todavía no se tocó. */
export function defaultConfig(code: AutomationCode): Record<string, number | string> {
  return Object.fromEntries(AUTOMATION_SPEC[code].params.map((p) => [p.key, p.default]));
}

/**
 * Valida la config contra lo que declara el catálogo.
 *
 * Descarta cualquier clave que el catálogo no declare: la config entra como JSON libre y sin esto
 * cualquiera podría guardar lo que quisiera dentro de la fila.
 */
export function parseConfig(code: AutomationCode, raw: unknown): Record<string, number | string> {
  const entrada = (raw ?? {}) as Record<string, unknown>;
  const salida: Record<string, number | string> = {};
  for (const param of AUTOMATION_SPEC[code].params) {
    const valor = entrada[param.key];
    if (param.type === 'number') {
      const n = typeof valor === 'string' ? Number(valor) : valor;
      salida[param.key] =
        typeof n === 'number' && Number.isFinite(n)
          ? Math.min(param.max ?? Infinity, Math.max(param.min ?? -Infinity, Math.trunc(n)))
          : (param.default as number);
    } else {
      const t = typeof valor === 'string' ? valor.trim() : '';
      salida[param.key] = t.length > 0 ? t.slice(0, 200) : (param.default as string);
    }
  }
  return salida;
}

/** La descripción con los valores puestos, para mostrarla ya armada. */
export function describeAutomation(code: AutomationCode, config: Record<string, unknown>): string {
  return AUTOMATION_SPEC[code].description.replace(/\{(\w+)\}/g, (_, key) =>
    String(config[key] ?? AUTOMATION_SPEC[code].params.find((p) => p.key === key)?.default ?? '')
  );
}

export const updateAutomationSchema = z.object({
  enabled: z.boolean().optional(),
  config: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
});

export interface AutomationDTO {
  code: AutomationCode;
  enabled: boolean;
  config: Record<string, number | string>;
}

export interface AutomationRunDTO {
  code: AutomationCode;
  targetType: string;
  targetId: string;
  detail: string;
  createdAt: string;
}
