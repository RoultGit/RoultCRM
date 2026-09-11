import {
  splitAmount,
  PLAN_LABEL,
  type InstallmentDTO,
  type ReceivableTotals,
  type createInstallmentSchema,
  type updateInstallmentSchema,
  type payInstallmentSchema,
  type generatePlanSchema,
} from '@roult/shared';
import type { z } from 'zod';
import { Prisma } from '@prisma/client';
import type { Installment } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { NotFoundError, ConflictError } from '../../lib/errors.js';
import { ownerFilter, type Actor } from '../../lib/scope.js';

type ConVenta = Installment & {
  deal: { title: string; companyId: string; company: { name: string } };
};

const INCLUDE = {
  deal: { select: { title: true, companyId: true, company: { select: { name: true } } } },
} as const;

/** Medianoche UTC de hoy: las fechas del sistema son fechas peladas, sin hora. */
function hoyPelado(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function toDTO(cuota: ConVenta, hoy = hoyPelado()): InstallmentDTO {
  return {
    id: cuota.id,
    dealId: cuota.dealId,
    dealTitle: cuota.deal.title,
    companyId: cuota.deal.companyId,
    companyName: cuota.deal.company.name,
    concept: cuota.concept,
    amount: Number(cuota.amount),
    currency: cuota.currency,
    dueDate: cuota.dueDate.toISOString(),
    paidAt: cuota.paidAt?.toISOString() ?? null,
    paidAmount: cuota.paidAmount === null ? null : Number(cuota.paidAmount),
    method: cuota.method,
    note: cuota.note,
    // Una cuota que vence HOY todavía no está vencida: se puede cobrar hoy, y reclamarle al cliente
    // el mismo día sería quedar mal por un error nuestro.
    overdue: !cuota.paidAt && cuota.dueDate < hoy,
  };
}

/** La venta tiene que existir y ser del alcance del actor. Es la única puerta de este módulo. */
async function assertDeal(actor: Actor, dealId: string) {
  const deal = await prisma.deal.findFirst({
    where: { id: dealId, tenantId: actor.tenantId, ...ownerFilter(actor) },
    select: { id: true, amount: true, currency: true, billingType: true, title: true },
  });
  // 404 y no 403: decir "existe pero no es tuya" ya revela que esa venta existe en la empresa.
  if (!deal) throw new NotFoundError('Deal not found');
  return deal;
}

async function findMine(actor: Actor, id: string): Promise<ConVenta> {
  const cuota = await prisma.installment.findFirst({
    where: { id, tenantId: actor.tenantId, deal: { ...ownerFilter(actor) } },
    include: INCLUDE,
  });
  if (!cuota) throw new NotFoundError('Installment not found');
  return cuota;
}

function sumarMeses(desde: Date, meses: number): Date {
  const d = new Date(desde);
  d.setUTCMonth(d.getUTCMonth() + meses);
  return d;
}

function sumarDias(desde: Date, dias: number): Date {
  const d = new Date(desde);
  d.setUTCDate(d.getUTCDate() + dias);
  return d;
}

export const InstallmentsService = {
  async list(
    actor: Actor,
    filters: { dealId?: string; companyId?: string; status?: 'pending' | 'overdue' | 'paid' } = {}
  ): Promise<InstallmentDTO[]> {
    const hoy = hoyPelado();
    const cuotas = await prisma.installment.findMany({
      where: {
        AND: [
          { tenantId: actor.tenantId, deal: { ...ownerFilter(actor) } },
          {
            ...(filters.dealId ? { dealId: filters.dealId } : {}),
            ...(filters.companyId ? { deal: { companyId: filters.companyId, ...ownerFilter(actor) } } : {}),
            ...(filters.status === 'paid' ? { paidAt: { not: null } } : {}),
            ...(filters.status === 'pending' ? { paidAt: null } : {}),
            ...(filters.status === 'overdue' ? { paidAt: null, dueDate: { lt: hoy } } : {}),
          },
        ],
      },
      include: INCLUDE,
      orderBy: [{ dueDate: 'asc' }, { position: 'asc' }],
    });
    return cuotas.map((cuota) => toDTO(cuota, hoy));
  },

  /**
   * Lo que falta cobrar, por moneda.
   *
   * Nunca en un solo número: sumar soles con dólares no es un total, es un error con formato de
   * moneda que alguien va a llevar a una reunión.
   */
  async totals(actor: Actor): Promise<ReceivableTotals> {
    const hoy = hoyPelado();
    const cuotas = await prisma.installment.findMany({
      where: { tenantId: actor.tenantId, deal: { ...ownerFilter(actor) } },
      select: { amount: true, paidAmount: true, currency: true, dueDate: true, paidAt: true },
    });

    const totals: ReceivableTotals = { pending: {}, overdue: {}, paid: {} };
    const sumar = (donde: Record<string, number>, moneda: string, monto: number) => {
      donde[moneda] = Math.round(((donde[moneda] ?? 0) + monto) * 100) / 100;
    };

    for (const cuota of cuotas) {
      if (cuota.paidAt) {
        sumar(totals.paid, cuota.currency, Number(cuota.paidAmount ?? cuota.amount));
        continue;
      }
      sumar(totals.pending, cuota.currency, Number(cuota.amount));
      if (cuota.dueDate < hoy) sumar(totals.overdue, cuota.currency, Number(cuota.amount));
    }
    return totals;
  },

  async create(actor: Actor, input: z.infer<typeof createInstallmentSchema>): Promise<InstallmentDTO> {
    const deal = await assertDeal(actor, input.dealId);
    const cuota = await prisma.installment.create({
      data: {
        tenantId: actor.tenantId,
        dealId: deal.id,
        concept: input.concept,
        amount: new Prisma.Decimal(input.amount),
        // La moneda sale de la venta y no se elige aparte: una cuota en otra moneda que su venta
        // sería un estado de cuenta imposible de cuadrar.
        currency: deal.currency,
        dueDate: new Date(input.dueDate),
        note: input.note ?? null,
      },
      include: INCLUDE,
    });
    return toDTO(cuota);
  },

  /**
   * Arma el plan de cobranza de una venta.
   *
   * Lo ya cobrado NO se toca: rehacer el plan reemplaza lo que falta cobrar, pero la plata que
   * entró no puede desaparecer porque alguien apretó "generar" de nuevo.
   */
  async generate(actor: Actor, input: z.infer<typeof generatePlanSchema>): Promise<InstallmentDTO[]> {
    const deal = await assertDeal(actor, input.dealId);
    const desde = input.startDate ? new Date(input.startDate) : hoyPelado();
    const total = input.total ?? Number(deal.amount);

    const nuevas: { concept: string; amount: number; dueDate: Date }[] = [];
    if (input.plan === 'ADELANTO_SALDO') {
      const adelanto = Math.round(total * input.upfrontPct) / 100;
      nuevas.push({ concept: `Adelanto ${input.upfrontPct}%`, amount: adelanto, dueDate: desde });
      nuevas.push({
        concept: `Saldo ${100 - input.upfrontPct}%`,
        amount: Math.round((total - adelanto) * 100) / 100,
        dueDate: sumarDias(desde, input.balanceDays),
      });
    } else if (input.plan === 'CUOTAS_IGUALES') {
      splitAmount(total, input.count).forEach((amount, i) => {
        nuevas.push({ concept: `Cuota ${i + 1} de ${input.count}`, amount, dueDate: sumarMeses(desde, i) });
      });
    } else {
      // MENSUAL: en una suscripción el monto de la venta ES lo que se cobra cada mes, no el total.
      for (let i = 0; i < input.count; i += 1) {
        nuevas.push({ concept: `Cuota ${i + 1} de ${input.count}`, amount: total, dueDate: sumarMeses(desde, i) });
      }
    }

    await prisma.$transaction([
      prisma.installment.deleteMany({ where: { dealId: deal.id, paidAt: null } }),
      prisma.installment.createMany({
        data: nuevas.map((cuota, position) => ({
          tenantId: actor.tenantId,
          dealId: deal.id,
          concept: cuota.concept,
          amount: new Prisma.Decimal(cuota.amount),
          currency: deal.currency,
          dueDate: cuota.dueDate,
          position,
        })),
      }),
    ]);

    const creadas = await prisma.installment.findMany({
      where: { dealId: deal.id, paidAt: null },
      include: INCLUDE,
      orderBy: [{ dueDate: 'asc' }, { position: 'asc' }],
    });
    return creadas.map((cuota) => toDTO(cuota));
  },

  async update(actor: Actor, id: string, input: z.infer<typeof updateInstallmentSchema>): Promise<InstallmentDTO> {
    const existing = await findMine(actor, id);
    // Cambiarle el monto a algo ya cobrado deja el estado de cuenta mintiendo sobre lo que entró.
    if (existing.paidAt) throw new ConflictError('Una cuota ya cobrada no se edita. Deshacé el pago primero.');

    await prisma.installment.update({
      where: { id },
      data: {
        ...(input.concept !== undefined ? { concept: input.concept } : {}),
        ...(input.amount !== undefined ? { amount: new Prisma.Decimal(input.amount) } : {}),
        ...(input.dueDate !== undefined ? { dueDate: new Date(input.dueDate) } : {}),
        ...(input.note !== undefined ? { note: input.note || null } : {}),
      },
    });
    return toDTO(await findMine(actor, id));
  },

  async pay(actor: Actor, id: string, input: z.infer<typeof payInstallmentSchema>): Promise<InstallmentDTO> {
    const existing = await findMine(actor, id);
    if (existing.paidAt) throw new ConflictError('Esa cuota ya figura cobrada');

    await prisma.installment.update({
      where: { id },
      data: {
        paidAt: input.paidAt ? new Date(input.paidAt) : new Date(),
        // Vacío significa "entró lo que decía la cuota", que es el caso normal.
        paidAmount: new Prisma.Decimal(input.paidAmount ?? Number(existing.amount)),
        method: input.method ?? null,
        ...(input.note !== undefined ? { note: input.note || null } : {}),
      },
    });
    return toDTO(await findMine(actor, id));
  },

  /** Para el dedo equivocado. Sin esto, marcar mal una cuota obliga a borrarla y rehacerla. */
  async unpay(actor: Actor, id: string): Promise<InstallmentDTO> {
    await findMine(actor, id);
    await prisma.installment.update({
      where: { id },
      data: { paidAt: null, paidAmount: null, method: null },
    });
    return toDTO(await findMine(actor, id));
  },

  async remove(actor: Actor, id: string): Promise<void> {
    const existing = await findMine(actor, id);
    if (existing.paidAt) throw new ConflictError('Una cuota ya cobrada no se borra');
    await prisma.installment.delete({ where: { id } });
  },
};

export { PLAN_LABEL };
