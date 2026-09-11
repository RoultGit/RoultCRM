import type { AutomationCode } from '@roult/shared';
import { AUTOMATION_SPEC, defaultConfig, parseConfig } from '@roult/shared';
import type { Prisma, RelatedType } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import type { AuditAction, AuditEntity } from '../../lib/audit.js';

/**
 * Quién figura como autor de lo que crea el motor.
 *
 * Mismo criterio que los mensajes entrantes de WhatsApp: no lo escribió nadie del equipo, y decir
 * "Alguien" sería peor que decir la verdad.
 */
export const AUTOMATION_AUTHOR = 'automation';

/** Tope por corrida de calendario. Prender el interruptor con 5000 ventas viejas no puede generar
 *  5000 tareas de una sentada. */
const TOPE_POR_CORRIDA = 200;

export interface DomainEvent {
  tenantId: string;
  action: AuditAction;
  entityType: AuditEntity;
  entityId: string;
  before?: unknown;
  after?: unknown;
}

interface Contexto {
  tenantId: string;
  config: Record<string, number | string>;
  now: Date;
}

/** El monto como lo escribiría una persona. "PEN 4250" en el título de una tarea se lee como un
 *  código de sistema; "S/ 4,250.00" se lee como plata. */
function comoPlata(monto: number, moneda: string): string {
  return new Intl.NumberFormat('es-PE', { style: 'currency', currency: moneda }).format(monto);
}

/** Medianoche UTC de una fecha, que es como guarda las fechas todo el resto del sistema. */
function aFechaPelada(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function sumarDias(d: Date, dias: number): Date {
  const copia = new Date(d);
  copia.setUTCDate(copia.getUTCDate() + dias);
  return copia;
}

async function primerAdmin(tenantId: string): Promise<string | null> {
  const admin = await prisma.user.findFirst({
    where: { tenantId, role: 'ADMIN', status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  return admin?.id ?? null;
}

async function esUsuarioVivo(tenantId: string, userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const user = await prisma.user.findFirst({ where: { id: userId, tenantId, status: 'ACTIVE' }, select: { id: true } });
  return !!user;
}

/**
 * Crea una tarea y deja constancia de que la creó el motor.
 *
 * Escribe con prisma directo y NO pasa por el servicio de tareas ni por recordAudit. Esa es la
 * barrera contra la cascada: si el motor auditara sus propias escrituras, la automatización que
 * crea una tarea dispararía la de tareas y no pararía nunca.
 */
async function crearTarea(
  ctx: Contexto,
  code: AutomationCode,
  tarea: { title: string; ownerId: string; dueDate: Date; relatedType?: RelatedType; relatedId?: string; priority?: 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW' },
  detail: string,
  target: { type: RelatedType; id: string }
): Promise<void> {
  await prisma.task.create({
    data: {
      tenantId: ctx.tenantId,
      title: tarea.title,
      ownerId: tarea.ownerId,
      dueDate: tarea.dueDate,
      priority: tarea.priority ?? 'MEDIUM',
      createdById: AUTOMATION_AUTHOR,
      relatedType: tarea.relatedType ?? null,
      relatedId: tarea.relatedId ?? null,
    },
  });
  await prisma.automationRun.create({
    data: {
      tenantId: ctx.tenantId,
      code,
      targetType: target.type,
      targetId: target.id,
      detail,
      // La fecha se pasa explícita y no se deja en now(): la corrida de calendario se compara
      // contra el último movimiento del registro, y con el reloj real eso no se puede probar.
      createdAt: ctx.now,
    },
  });
}

/**
 * ¿Ya actuó esta automatización sobre este registro desde la última vez que el registro se movió?
 *
 * Es lo que evita que "venta quieta" cree la misma tarea todas las mañanas, sin impedir que vuelva
 * a avisar si la venta se movió y se quedó quieta de nuevo.
 */
async function yaActuoDesde(tenantId: string, code: AutomationCode, targetId: string, desde: Date): Promise<boolean> {
  const run = await prisma.automationRun.findFirst({
    where: { tenantId, code, targetId, createdAt: { gt: desde } },
    select: { id: true },
  });
  return !!run;
}

// ── Automatizaciones de evento ───────────────────────────────────────────────

async function tareaAlLlegarAEtapa(ctx: Contexto, event: DomainEvent, code: AutomationCode, etapa: string): Promise<number> {
  if (event.entityType !== 'DEAL' || event.action !== 'STAGE_CHANGE') return 0;
  const antes = (event.before as { stage?: string } | undefined)?.stage;
  const despues = (event.after as { stage?: string } | undefined)?.stage;
  // Solo la transición HACIA la etapa. Sin comparar con el antes, un guardado cualquiera sobre una
  // venta que ya estaba en Propuesta volvería a crear la tarea.
  if (despues !== etapa || antes === etapa) return 0;

  const deal = await prisma.deal.findFirst({
    where: { id: event.entityId, tenantId: ctx.tenantId },
    select: { id: true, title: true, assignedUserId: true, company: { select: { name: true } } },
  });
  if (!deal) return 0;

  const owner = (await esUsuarioVivo(ctx.tenantId, deal.assignedUserId))
    ? deal.assignedUserId!
    : await primerAdmin(ctx.tenantId);
  if (!owner) return 0;

  const titulo = String(ctx.config.titulo ?? '');
  const dias = Number(ctx.config.dias ?? 0);
  await crearTarea(
    ctx,
    code,
    {
      title: `${titulo} — ${deal.company.name}`,
      ownerId: owner,
      dueDate: sumarDias(aFechaPelada(ctx.now), dias),
      relatedType: 'DEAL',
      relatedId: deal.id,
    },
    `Tarea creada al pasar "${deal.title}" a ${etapa}`,
    { type: 'DEAL', id: deal.id }
  );
  return 1;
}

async function repartirLead(ctx: Contexto, event: DomainEvent): Promise<number> {
  if (event.entityType !== 'LEAD' || event.action !== 'CREATE') return 0;

  const lead = await prisma.lead.findFirst({
    where: { id: event.entityId, tenantId: ctx.tenantId },
    select: { id: true, businessName: true, assignedUserId: true },
  });
  // Un lead que ya viene con dueño no se toca: quien lo cargó sabe mejor que el reparto automático.
  if (!lead || lead.assignedUserId) return 0;

  const vendedores = await prisma.user.findMany({
    where: { tenantId: ctx.tenantId, role: 'VENDEDOR', status: 'ACTIVE' },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  if (vendedores.length === 0) return 0;

  // Al que menos leads abiertos tenga, y no por turno rotativo: no hay que guardar de quién era el
  // turno, y si alguien está de vacaciones el reparto se corrige solo en vez de seguir cargándolo.
  const abiertos = await prisma.lead.groupBy({
    by: ['assignedUserId'],
    where: {
      tenantId: ctx.tenantId,
      assignedUserId: { in: vendedores.map((v) => v.id) },
      status: { in: ['NEW', 'CONTACTED', 'QUALIFIED'] },
    },
    _count: { _all: true },
  });
  const carga = new Map(abiertos.map((fila) => [fila.assignedUserId as string, fila._count._all]));
  const elegido = vendedores.reduce((mejor, v) =>
    (carga.get(v.id) ?? 0) < (carga.get(mejor.id) ?? 0) ? v : mejor
  );

  await prisma.lead.update({ where: { id: lead.id }, data: { assignedUserId: elegido.id } });
  await prisma.automationRun.create({
    data: {
      tenantId: ctx.tenantId,
      code: 'LEAD_AUTO_ASSIGN',
      targetType: 'LEAD',
      targetId: lead.id,
      detail: `"${lead.businessName}" asignado automáticamente`,
      createdAt: ctx.now,
    },
  });
  return 1;
}

// ── Automatizaciones de calendario ───────────────────────────────────────────

async function ventaQuieta(ctx: Contexto, restante: number): Promise<number> {
  const dias = Number(ctx.config.dias ?? 14);
  const limite = sumarDias(ctx.now, -dias);
  const ventas = await prisma.deal.findMany({
    where: {
      tenantId: ctx.tenantId,
      // Una venta entregada o perdida ya no tiene por qué moverse.
      stage: { notIn: ['ENTREGADO', 'PERDIDO'] },
      updatedAt: { lt: limite },
    },
    select: { id: true, title: true, updatedAt: true, assignedUserId: true, company: { select: { name: true } } },
    orderBy: { updatedAt: 'asc' },
    take: restante,
  });

  let hechas = 0;
  for (const venta of ventas) {
    if (hechas >= restante) break;
    if (await yaActuoDesde(ctx.tenantId, 'DEAL_STALE', venta.id, venta.updatedAt)) continue;
    const owner = (await esUsuarioVivo(ctx.tenantId, venta.assignedUserId))
      ? venta.assignedUserId!
      : await primerAdmin(ctx.tenantId);
    if (!owner) continue;

    await crearTarea(
      ctx,
      'DEAL_STALE',
      {
        title: `Retomar la venta con ${venta.company.name}`,
        ownerId: owner,
        dueDate: aFechaPelada(ctx.now),
        relatedType: 'DEAL',
        relatedId: venta.id,
        priority: 'HIGH',
      },
      `"${venta.title}" lleva ${dias} días sin moverse`,
      { type: 'DEAL', id: venta.id }
    );
    hechas += 1;
  }
  return hechas;
}

async function leadSinTocar(ctx: Contexto, restante: number): Promise<number> {
  const dias = Number(ctx.config.dias ?? 3);
  const limite = sumarDias(ctx.now, -dias);
  const admin = await primerAdmin(ctx.tenantId);
  if (!admin) return 0;

  const leads = await prisma.lead.findMany({
    where: { tenantId: ctx.tenantId, status: 'NEW', createdAt: { lt: limite } },
    select: { id: true, businessName: true, updatedAt: true },
    orderBy: { createdAt: 'asc' },
    take: restante,
  });

  let hechas = 0;
  for (const lead of leads) {
    if (hechas >= restante) break;
    if (await yaActuoDesde(ctx.tenantId, 'LEAD_UNTOUCHED', lead.id, lead.updatedAt)) continue;
    await crearTarea(
      ctx,
      'LEAD_UNTOUCHED',
      {
        title: `Sin tocar hace ${dias} días: ${lead.businessName}`,
        ownerId: admin,
        dueDate: aFechaPelada(ctx.now),
        relatedType: 'LEAD',
        relatedId: lead.id,
        priority: 'HIGH',
      },
      `"${lead.businessName}" sigue en Nuevo`,
      { type: 'LEAD', id: lead.id }
    );
    hechas += 1;
  }
  return hechas;
}

async function escalarTareaVencida(ctx: Contexto, restante: number): Promise<number> {
  const dias = Number(ctx.config.dias ?? 7);
  const limite = sumarDias(aFechaPelada(ctx.now), -dias);
  const admin = await primerAdmin(ctx.tenantId);
  if (!admin) return 0;

  const vencidas = await prisma.task.findMany({
    where: {
      tenantId: ctx.tenantId,
      status: { not: 'DONE' },
      dueDate: { lt: limite },
      // Una tarea que creó el motor no se escala: la escalación es una tarea más, y sin esto se
      // escalaría a sí misma todas las mañanas.
      //
      // El OR con null es obligatorio: en SQL, `NOT (columna = valor)` da NULL para las filas
      // donde la columna es NULL, así que dejaba afuera todas las tareas viejas sin autor.
      OR: [{ createdById: null }, { createdById: { not: AUTOMATION_AUTHOR } }],
    },
    select: { id: true, title: true, updatedAt: true, ownerId: true },
    orderBy: { dueDate: 'asc' },
    take: restante,
  });

  let hechas = 0;
  for (const tarea of vencidas) {
    if (hechas >= restante) break;
    if (tarea.ownerId === admin) continue; // escalarle al mismo admin no le dice nada nuevo
    if (await yaActuoDesde(ctx.tenantId, 'TASK_OVERDUE_ESCALATE', tarea.id, tarea.updatedAt)) continue;
    await crearTarea(
      ctx,
      'TASK_OVERDUE_ESCALATE',
      {
        title: `Atrasada hace ${dias} días: ${tarea.title}`,
        ownerId: admin,
        dueDate: aFechaPelada(ctx.now),
        relatedType: null as unknown as RelatedType,
        priority: 'HIGH',
      },
      `"${tarea.title}" sigue sin cerrarse`,
      { type: 'DEAL', id: tarea.id }
    );
    hechas += 1;
  }
  return hechas;
}

async function cuotaVencida(ctx: Contexto, restante: number): Promise<number> {
  const dias = Number(ctx.config.dias ?? 3);
  const limite = sumarDias(aFechaPelada(ctx.now), -dias);

  const cuotas = await prisma.installment.findMany({
    where: { tenantId: ctx.tenantId, paidAt: null, dueDate: { lt: limite } },
    select: {
      id: true,
      concept: true,
      amount: true,
      currency: true,
      updatedAt: true,
      dealId: true,
      deal: { select: { assignedUserId: true, company: { select: { name: true } } } },
    },
    orderBy: { dueDate: 'asc' },
    take: restante,
  });

  let hechas = 0;
  for (const cuota of cuotas) {
    if (hechas >= restante) break;
    if (await yaActuoDesde(ctx.tenantId, 'INSTALLMENT_OVERDUE', cuota.id, cuota.updatedAt)) continue;
    const owner = (await esUsuarioVivo(ctx.tenantId, cuota.deal.assignedUserId))
      ? cuota.deal.assignedUserId!
      : await primerAdmin(ctx.tenantId);
    if (!owner) continue;

    await crearTarea(
      ctx,
      'INSTALLMENT_OVERDUE',
      {
        title: `Cobrar ${comoPlata(Number(cuota.amount), cuota.currency)} a ${cuota.deal.company.name}`,
        ownerId: owner,
        dueDate: aFechaPelada(ctx.now),
        relatedType: 'DEAL',
        relatedId: cuota.dealId,
        priority: 'URGENT',
      },
      `"${cuota.concept}" lleva ${dias} días vencida`,
      // El registro apunta a la CUOTA y no a la venta: una venta puede tener varias vencidas y hay
      // que poder avisar de cada una sin que la primera tape a las demás.
      { type: 'DEAL', id: cuota.id }
    );
    hechas += 1;
  }
  return hechas;
}

// ── Entradas ─────────────────────────────────────────────────────────────────

async function prendidas(tenantId: string, kind: 'EVENT' | 'SCHEDULED') {
  const filas = await prisma.automation.findMany({ where: { tenantId, enabled: true } });
  return filas
    .filter((fila) => AUTOMATION_SPEC[fila.code as AutomationCode]?.kind === kind)
    .map((fila) => ({
      code: fila.code as AutomationCode,
      config: parseConfig(fila.code as AutomationCode, fila.config),
    }));
}

/**
 * Lo que corre en el momento del cambio.
 *
 * NUNCA lanza: si una automatización falla, el guardado del vendedor tiene que pasar igual. Una
 * tarea que no se creó es un problema; una venta que no se guardó es otro mucho peor.
 */
export async function runEvent(event: DomainEvent): Promise<void> {
  try {
    const activas = await prendidas(event.tenantId, 'EVENT');
    if (activas.length === 0) return;
    const now = new Date();

    for (const activa of activas) {
      const ctx: Contexto = { tenantId: event.tenantId, config: activa.config, now };
      try {
        switch (activa.code) {
          case 'DEAL_STAGE_TASK_PROPUESTA':
            await tareaAlLlegarAEtapa(ctx, event, activa.code, 'PROPUESTA');
            break;
          case 'DEAL_STAGE_TASK_ENTREGADO':
            await tareaAlLlegarAEtapa(ctx, event, activa.code, 'ENTREGADO');
            break;
          case 'LEAD_AUTO_ASSIGN':
            await repartirLead(ctx, event);
            break;
          default:
            break;
        }
      } catch (err) {
        console.error(`[automatizaciones] falló ${activa.code}`, err);
      }
    }
  } catch (err) {
    console.error('[automatizaciones] no se pudieron evaluar', err);
  }
}

export interface ScheduledResult {
  empresas: number;
  acciones: number;
}

/** Lo que corre en la pasada de la mañana, para todas las empresas. */
export async function runScheduled(now = new Date(), tope = TOPE_POR_CORRIDA): Promise<ScheduledResult> {
  const resultado: ScheduledResult = { empresas: 0, acciones: 0 };
  const tenants = await prisma.automation.findMany({
    where: { enabled: true },
    select: { tenantId: true },
    distinct: ['tenantId'],
  });

  for (const { tenantId } of tenants) {
    const activas = await prendidas(tenantId, 'SCHEDULED');
    if (activas.length === 0) continue;
    resultado.empresas += 1;

    // El tope es POR EMPRESA: una con muchas ventas viejas no puede consumir el cupo de las demás.
    let restante = tope;
    for (const activa of activas) {
      if (restante <= 0) break;
      const ctx: Contexto = { tenantId, config: activa.config, now };
      try {
        const hechas =
          activa.code === 'DEAL_STALE'
            ? await ventaQuieta(ctx, restante)
            : activa.code === 'LEAD_UNTOUCHED'
              ? await leadSinTocar(ctx, restante)
              : activa.code === 'TASK_OVERDUE_ESCALATE'
                ? await escalarTareaVencida(ctx, restante)
                : activa.code === 'INSTALLMENT_OVERDUE'
                  ? await cuotaVencida(ctx, restante)
                  : 0;
        restante -= hechas;
        resultado.acciones += hechas;
      } catch (err) {
        console.error(`[automatizaciones] falló ${activa.code} en ${tenantId}`, err);
      }
    }
  }
  return resultado;
}

export { defaultConfig };
export type { Prisma };
