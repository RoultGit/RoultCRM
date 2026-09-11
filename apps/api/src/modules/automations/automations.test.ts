import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { signAccessToken } from '../../lib/tokens.js';
import { runScheduled } from './engine.js';

const HOY = new Date('2026-10-01T13:00:00.000Z');
const diasAtras = (n: number) => new Date(HOY.getTime() - n * 24 * 60 * 60 * 1000);

describe('automatizaciones', () => {
  const app = createApp();
  let tenantId: string;
  let otroTenantId: string;
  let adminId: string;
  let adminToken: string;
  let anaId: string;
  let brunoId: string;
  let companyId: string;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test-access-secret';
    tenantId = (await prisma.tenant.create({ data: { name: 'Autom Tenant' } })).id;
    otroTenantId = (await prisma.tenant.create({ data: { name: 'Autom Otro' } })).id;
    const crear = async (nombre: string, role: 'ADMIN' | 'VENDEDOR', tid = tenantId) =>
      (
        await prisma.user.create({
          data: {
            tenantId: tid,
            email: `${nombre.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@roult.pe`,
            passwordHash: 'x',
            firstName: nombre,
            lastName: 'Auto',
            role,
          },
        })
      ).id;
    adminId = await crear('Admin', 'ADMIN');
    anaId = await crear('Ana', 'VENDEDOR');
    brunoId = await crear('Bruno', 'VENDEDOR');
    adminToken = signAccessToken({ userId: adminId, tenantId, role: 'ADMIN' });
  });

  afterAll(async () => {
    for (const id of [tenantId, otroTenantId]) {
      await prisma.automationRun.deleteMany({ where: { tenantId: id } });
      await prisma.automation.deleteMany({ where: { tenantId: id } });
      await prisma.apiKey.deleteMany({ where: { tenantId: id } });
      await prisma.task.deleteMany({ where: { tenantId: id } });
      await prisma.deal.deleteMany({ where: { tenantId: id } });
      await prisma.lead.deleteMany({ where: { tenantId: id } });
      await prisma.auditLog.deleteMany({ where: { tenantId: id } });
      await prisma.company.deleteMany({ where: { tenantId: id } });
      await prisma.user.deleteMany({ where: { tenantId: id } });
      await prisma.tenant.delete({ where: { id } });
    }
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    for (const id of [tenantId, otroTenantId]) {
      await prisma.automationRun.deleteMany({ where: { tenantId: id } });
      await prisma.automation.deleteMany({ where: { tenantId: id } });
      await prisma.task.deleteMany({ where: { tenantId: id } });
      await prisma.deal.deleteMany({ where: { tenantId: id } });
      await prisma.lead.deleteMany({ where: { tenantId: id } });
      await prisma.company.deleteMany({ where: { tenantId: id } });
    }
    companyId = (await prisma.company.create({ data: { tenantId, name: 'Cliente Autom', line: 'WEB' } })).id;
  });

  const prender = (code: string, config: Record<string, unknown> = {}, token = adminToken) =>
    request(app).patch(`/automations/${code}`).set('Authorization', `Bearer ${token}`).send({ enabled: true, config });

  const crearVenta = (extra: Record<string, unknown> = {}) =>
    prisma.deal.create({
      data: { tenantId, companyId, title: 'Sitio web', amount: 5000, currency: 'PEN', assignedUserId: anaId, ...extra },
    });

  const tareas = () => prisma.task.findMany({ where: { tenantId }, orderBy: { createdAt: 'asc' } });

  // ── Configuración ────────────────────────────────────────────────────────

  describe('configurar', () => {
    it('lista las seis apagadas y con los valores de fábrica', async () => {
      const res = await request(app).get('/automations').set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(7);
      expect(res.body.every((a: { enabled: boolean }) => !a.enabled)).toBe(true);
      const quieta = res.body.find((a: { code: string }) => a.code === 'DEAL_STALE');
      expect(quieta.config.dias).toBe(14);
    });

    it('no las toca un vendedor', async () => {
      // Prender una automatización cambia el trabajo de todo el equipo: no es del vendedor.
      const vendedorToken = signAccessToken({ userId: anaId, tenantId, role: 'VENDEDOR' });
      expect((await prender('DEAL_STALE', {}, vendedorToken)).status).toBe(403);
    });

    it('guarda los números ajustados', async () => {
      await prender('DEAL_STALE', { dias: 30 });
      const res = await request(app).get('/automations').set('Authorization', `Bearer ${adminToken}`);
      const quieta = res.body.find((a: { code: string }) => a.code === 'DEAL_STALE');
      expect(quieta).toMatchObject({ enabled: true, config: { dias: 30 } });
    });

    it('descarta lo que el catálogo no declara y recorta lo que se va de rango', async () => {
      // La config entra como JSON libre: sin esto cualquiera guardaría lo que quisiera adentro.
      await prender('DEAL_STALE', { dias: 99999, inventado: 'x', role: 'ADMIN' });
      const res = await request(app).get('/automations').set('Authorization', `Bearer ${adminToken}`);
      const quieta = res.body.find((a: { code: string }) => a.code === 'DEAL_STALE');
      expect(quieta.config).toEqual({ dias: 365 });
    });

    it('rechaza un código que no existe', async () => {
      expect((await prender('CUALQUIER_COSA')).status).toBe(400);
    });
  });

  // ── Automatizaciones de evento ───────────────────────────────────────────

  describe('tarea al pasar a Propuesta', () => {
    const pasarA = (id: string, stage: string) =>
      request(app).patch(`/deals/${id}/stage`).set('Authorization', `Bearer ${adminToken}`).send({ stage });

    it('apagada no hace nada', async () => {
      const deal = await crearVenta();
      await pasarA(deal.id, 'PROPUESTA');
      expect(await tareas()).toHaveLength(0);
    });

    it('prendida crea la tarea para el vendedor de la venta', async () => {
      await prender('DEAL_STAGE_TASK_PROPUESTA', { titulo: 'Mandar la cotización', dias: 2 });
      const deal = await crearVenta();
      const res = await pasarA(deal.id, 'PROPUESTA');
      expect(res.status).toBe(200);

      const creadas = await tareas();
      expect(creadas).toHaveLength(1);
      expect(creadas[0].title).toContain('Mandar la cotización');
      // Al vendedor de la venta, no a quien apretó el botón: el trabajo es suyo.
      expect(creadas[0].ownerId).toBe(anaId);
      expect(creadas[0].relatedType).toBe('DEAL');
      expect(creadas[0].relatedId).toBe(deal.id);
    });

    it('no dispara al pasar a otra etapa', async () => {
      await prender('DEAL_STAGE_TASK_PROPUESTA');
      const deal = await crearVenta();
      await pasarA(deal.id, 'NEGOCIACION');
      expect(await tareas()).toHaveLength(0);
    });

    it('la tarea que crea no dispara otra automatización', async () => {
      // Sin la barrera, una automatización que crea una tarea dispara la de tareas y no para.
      await prender('DEAL_STAGE_TASK_PROPUESTA');
      await prender('DEAL_STAGE_TASK_ENTREGADO');
      const deal = await crearVenta();
      await pasarA(deal.id, 'PROPUESTA');
      expect(await tareas()).toHaveLength(1);
    });

    it('deja registrado qué hizo', async () => {
      await prender('DEAL_STAGE_TASK_PROPUESTA');
      const deal = await crearVenta();
      await pasarA(deal.id, 'PROPUESTA');
      const corridas = await prisma.automationRun.findMany({ where: { tenantId } });
      expect(corridas).toHaveLength(1);
      expect(corridas[0]).toMatchObject({ code: 'DEAL_STAGE_TASK_PROPUESTA', targetId: deal.id });
    });
  });

  describe('repartir los leads nuevos', () => {
    const crearLead = (body: Record<string, unknown> = {}) =>
      request(app)
        .post('/leads')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ businessName: 'Panadería', contactName: 'Luis', line: 'WEB', ...body });

    it('apagada, el lead queda sin dueño', async () => {
      const res = await crearLead();
      expect(res.body.assignedUserId).toBeFalsy();
    });

    it('prendida, se lo da al vendedor con menos leads abiertos', async () => {
      await prender('LEAD_AUTO_ASSIGN');
      // Ana ya tiene dos; Bruno ninguno.
      await prisma.lead.createMany({
        data: [
          { tenantId, businessName: 'A', contactName: 'a', line: 'WEB', assignedUserId: anaId },
          { tenantId, businessName: 'B', contactName: 'b', line: 'WEB', assignedUserId: anaId },
        ],
      });
      await crearLead();
      const nuevo = await prisma.lead.findFirstOrThrow({ where: { tenantId, businessName: 'Panadería' } });
      expect(nuevo.assignedUserId).toBe(brunoId);
    });

    it('no le pisa el dueño a un lead que ya viene asignado', async () => {
      await prender('LEAD_AUTO_ASSIGN');
      await crearLead({ assignedUserId: anaId });
      const nuevo = await prisma.lead.findFirstOrThrow({ where: { tenantId, businessName: 'Panadería' } });
      expect(nuevo.assignedUserId).toBe(anaId);
    });

    it('también reparte el lead que entra por el formulario de la web', async () => {
      // Este es el caso donde más falta hace y el que se había quedado afuera: el lead entra de
      // madrugada por el formulario, nadie lo está mirando, y sin esto quedaba sin dueño hasta que
      // alguien lo viera. Falló porque la captación por clave no pasaba por recordAudit, que es de
      // donde el motor se entera de todo.
      await prender('LEAD_AUTO_ASSIGN');
      const rawKey = (
        await request(app).post('/intake/keys').set('Authorization', `Bearer ${adminToken}`).send({ name: 'Sitio' })
      ).body.key;

      const res = await request(app)
        .post('/intake/leads')
        .set('X-API-Key', rawKey)
        .send({ businessName: 'Del formulario', contactName: 'Quien sea', line: 'WEB' });
      expect(res.status).toBe(201);

      const lead = await prisma.lead.findFirstOrThrow({ where: { tenantId, businessName: 'Del formulario' } });
      expect(lead.assignedUserId).toBeTruthy();
      await prisma.apiKey.deleteMany({ where: { tenantId } });
    });

    it('sin vendedores activos no falla ni asigna', async () => {
      await prender('LEAD_AUTO_ASSIGN');
      await prisma.user.updateMany({ where: { tenantId, role: 'VENDEDOR' }, data: { status: 'INACTIVE' } });
      const res = await crearLead();
      expect(res.status).toBe(201);
      expect(res.body.assignedUserId).toBeFalsy();
      await prisma.user.updateMany({ where: { tenantId, role: 'VENDEDOR' }, data: { status: 'ACTIVE' } });
    });
  });

  // ── Automatizaciones de calendario ───────────────────────────────────────

  describe('venta quieta', () => {
    it('crea la tarea recién pasados los días configurados', async () => {
      await prender('DEAL_STALE', { dias: 14 });
      const quieta = await crearVenta({ title: 'Quieta', updatedAt: diasAtras(20) });
      await crearVenta({ title: 'Reciente', updatedAt: diasAtras(2) });

      await runScheduled(HOY);

      const creadas = await tareas();
      expect(creadas).toHaveLength(1);
      expect(creadas[0].relatedId).toBe(quieta.id);
      expect(creadas[0].ownerId).toBe(anaId);
    });

    it('no molesta con ventas ya cerradas ni perdidas', async () => {
      await prender('DEAL_STALE', { dias: 14 });
      await crearVenta({ title: 'Entregada', stage: 'ENTREGADO', updatedAt: diasAtras(90) });
      await crearVenta({ title: 'Perdida', stage: 'PERDIDO', lostReason: 'precio', updatedAt: diasAtras(90) });
      await runScheduled(HOY);
      expect(await tareas()).toHaveLength(0);
    });

    it('no repite la misma tarea todas las mañanas', async () => {
      await prender('DEAL_STALE', { dias: 14 });
      await crearVenta({ updatedAt: diasAtras(20) });
      await runScheduled(HOY);
      await runScheduled(new Date(HOY.getTime() + 24 * 60 * 60 * 1000));
      expect(await tareas()).toHaveLength(1);
    });

    it('vuelve a avisar si la venta se movió y se quedó quieta otra vez', async () => {
      await prender('DEAL_STALE', { dias: 14 });
      const deal = await crearVenta({ updatedAt: diasAtras(20) });
      await runScheduled(HOY);

      // Se movió ayer... y pasan otros 20 días.
      const despues = new Date(HOY.getTime() + 40 * 24 * 60 * 60 * 1000);
      await prisma.deal.update({ where: { id: deal.id }, data: { updatedAt: diasAtras(-20) } });
      await runScheduled(despues);

      expect(await tareas()).toHaveLength(2);
    });

    it('no toca las ventas de otra empresa', async () => {
      await prender('DEAL_STALE', { dias: 14 });
      const otraCompany = await prisma.company.create({ data: { tenantId: otroTenantId, name: 'Ajena', line: 'WEB' } });
      await prisma.deal.create({
        data: { tenantId: otroTenantId, companyId: otraCompany.id, title: 'Ajena', amount: 1, currency: 'PEN', updatedAt: diasAtras(90) },
      });
      await runScheduled(HOY);
      expect(await prisma.task.count({ where: { tenantId: otroTenantId } })).toBe(0);
    });
  });

  describe('lead sin tocar', () => {
    it('avisa al administrador de los leads que siguen en Nuevo', async () => {
      await prender('LEAD_UNTOUCHED', { dias: 3 });
      await prisma.lead.create({
        data: { tenantId, businessName: 'Olvidado', contactName: 'x', line: 'WEB', createdAt: diasAtras(10), updatedAt: diasAtras(10) },
      });
      await prisma.lead.create({
        data: { tenantId, businessName: 'Trabajado', contactName: 'y', line: 'WEB', status: 'CONTACTED', createdAt: diasAtras(10), updatedAt: diasAtras(10) },
      });
      await runScheduled(HOY);

      const creadas = await tareas();
      expect(creadas).toHaveLength(1);
      expect(creadas[0].ownerId).toBe(adminId);
      expect(creadas[0].title).toContain('Olvidado');
    });
  });

  describe('escalar tarea vencida', () => {
    it('le crea una tarea al administrador cuando algo lleva mucho atrasado', async () => {
      await prender('TASK_OVERDUE_ESCALATE', { dias: 7 });
      await prisma.task.create({
        data: { tenantId, title: 'Llamar al cliente', ownerId: anaId, dueDate: diasAtras(10) },
      });
      await runScheduled(HOY);

      const creadas = await tareas();
      expect(creadas).toHaveLength(2);
      const escalada = creadas.find((t) => t.ownerId === adminId);
      expect(escalada?.title).toContain('Llamar al cliente');
    });

    it('lo que escala no se vuelve a escalar', async () => {
      // La tarea de escalación es una tarea más: sin la barrera se escala a sí misma cada mañana.
      await prender('TASK_OVERDUE_ESCALATE', { dias: 7 });
      await prisma.task.create({
        data: { tenantId, title: 'Vieja', ownerId: anaId, dueDate: diasAtras(10) },
      });
      await runScheduled(HOY);
      await runScheduled(new Date(HOY.getTime() + 24 * 60 * 60 * 1000));
      expect(await tareas()).toHaveLength(2);
    });
  });

  describe('cobrar lo vencido', () => {
    it('le crea al vendedor una tarea de cobranza por la cuota atrasada', async () => {
      await prender('INSTALLMENT_OVERDUE', { dias: 3 });
      const deal = await crearVenta({ title: 'Con deuda' });
      await prisma.installment.create({
        data: {
          tenantId,
          dealId: deal.id,
          concept: 'Saldo 50%',
          amount: 3100,
          currency: 'PEN',
          dueDate: diasAtras(10),
        },
      });
      await runScheduled(HOY);

      const creadas = await tareas();
      expect(creadas).toHaveLength(1);
      expect(creadas[0].ownerId).toBe(anaId);
      expect(creadas[0].priority).toBe('URGENT');
      expect(creadas[0].title).toContain('Cobrar');
    });

    it('no molesta con lo que ya se cobró ni con lo que todavía no vence', async () => {
      await prender('INSTALLMENT_OVERDUE', { dias: 3 });
      const deal = await crearVenta();
      await prisma.installment.createMany({
        data: [
          { tenantId, dealId: deal.id, concept: 'Cobrada', amount: 100, currency: 'PEN', dueDate: diasAtras(30), paidAt: diasAtras(25), paidAmount: 100 },
          { tenantId, dealId: deal.id, concept: 'Por vencer', amount: 100, currency: 'PEN', dueDate: diasAtras(-30) },
        ],
      });
      await runScheduled(HOY);
      expect(await tareas()).toHaveLength(0);
    });

    it('avisa de cada cuota vencida, no solo de la primera de la venta', async () => {
      await prender('INSTALLMENT_OVERDUE', { dias: 3 });
      const deal = await crearVenta();
      await prisma.installment.createMany({
        data: [
          { tenantId, dealId: deal.id, concept: 'Cuota 1', amount: 100, currency: 'PEN', dueDate: diasAtras(40) },
          { tenantId, dealId: deal.id, concept: 'Cuota 2', amount: 100, currency: 'PEN', dueDate: diasAtras(10) },
        ],
      });
      await runScheduled(HOY);
      // Si el registro apuntara a la venta, la segunda cuota quedaría tapada por la primera.
      expect(await tareas()).toHaveLength(2);
    });
  });

  // ── Robustez ─────────────────────────────────────────────────────────────

  describe('robustez', () => {
    it('una automatización rota no tumba la operación del usuario', async () => {
      await prender('DEAL_STAGE_TASK_PROPUESTA');
      // Config imposible: el vendedor de la venta ya no existe.
      const deal = await crearVenta({ assignedUserId: 'no-existe' });
      const res = await request(app)
        .patch(`/deals/${deal.id}/stage`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ stage: 'PROPUESTA' });

      // El cambio de etapa del vendedor tiene que haber pasado igual.
      expect(res.status).toBe(200);
      expect((await prisma.deal.findUniqueOrThrow({ where: { id: deal.id } })).stage).toBe('PROPUESTA');
    });

    it('tiene un tope de acciones por corrida', async () => {
      // Sin tope, prender el interruptor con 5000 ventas viejas genera 5000 tareas de una.
      await prender('DEAL_STALE', { dias: 1 });
      await prisma.deal.createMany({
        data: Array.from({ length: 60 }, (_, i) => ({
          tenantId,
          companyId,
          title: `Vieja ${i}`,
          amount: 1,
          currency: 'PEN' as const,
          assignedUserId: anaId,
          updatedAt: diasAtras(30),
        })),
      });
      const resultado = await runScheduled(HOY, 25);
      expect(resultado.acciones).toBe(25);
      expect(await tareas()).toHaveLength(25);
    });
  });
});
