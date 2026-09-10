import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { buildDigests } from './reminders.service.js';

const HOY = new Date('2026-09-15T13:00:00.000Z');
const dia = (offset: number) => {
  const d = new Date(Date.UTC(2026, 8, 15));
  d.setUTCDate(d.getUTCDate() + offset);
  return d;
};

describe('recordatorios automáticos', () => {
  const app = createApp();
  let tenantId: string;
  let anaId: string;
  let brunoId: string;
  let companyId: string;

  beforeAll(async () => {
    tenantId = (await prisma.tenant.create({ data: { name: 'Recordatorios Tenant' } })).id;
    const crear = async (nombre: string, email: string) =>
      (
        await prisma.user.create({
          data: { tenantId, email, passwordHash: 'x', firstName: nombre, lastName: 'Pérez', role: 'VENDEDOR' },
        })
      ).id;
    anaId = await crear('Ana', `ana-${Date.now()}@roult.pe`);
    brunoId = await crear('Bruno', `bruno-${Date.now()}@roult.pe`);
    companyId = (await prisma.company.create({ data: { tenantId, name: 'Cliente Recordatorio', line: 'WEB' } })).id;
  });

  afterAll(async () => {
    await prisma.deal.deleteMany({ where: { tenantId } });
    await prisma.task.deleteMany({ where: { tenantId } });
    await prisma.company.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.deal.deleteMany({ where: { tenantId } });
    await prisma.task.deleteMany({ where: { tenantId } });
    await prisma.user.updateMany({ where: { tenantId }, data: { lastDigestAt: null, status: 'ACTIVE' } });
  });

  const tarea = (ownerId: string, title: string, offset: number, status: 'TODO' | 'DONE' = 'TODO') =>
    prisma.task.create({ data: { tenantId, title, ownerId, dueDate: dia(offset), status } });

  const mio = async (userId: string) => (await buildDigests(HOY)).find((d) => d.userId === userId);

  it('junta lo de hoy y lo vencido, y deja afuera lo que todavía no vence', async () => {
    await tarea(anaId, 'Llamar hoy', 0);
    await tarea(anaId, 'Se venció', -3);
    await tarea(anaId, 'Recién la semana que viene', 5);

    const digest = await mio(anaId);
    expect(digest?.items.map((i) => i.title)).toEqual(['Se venció', 'Llamar hoy']);
  });

  it('no recuerda una tarea ya terminada', async () => {
    await tarea(anaId, 'Terminada', -1, 'DONE');
    expect(await mio(anaId)).toBeUndefined();
  });

  it('a cada uno lo suyo', async () => {
    await tarea(anaId, 'De Ana', 0);
    await tarea(brunoId, 'De Bruno', 0);
    // Sin esto, el resumen podría mezclar pendientes y una persona vería los de otra.
    expect((await mio(anaId))?.items.map((i) => i.title)).toEqual(['De Ana']);
    expect((await mio(brunoId))?.items.map((i) => i.title)).toEqual(['De Bruno']);
  });

  it('avisa del próximo paso de una venta al que quedó a cargo', async () => {
    await prisma.deal.create({
      data: {
        tenantId,
        companyId,
        title: 'Rediseño web',
        amount: 5000,
        currency: 'PEN',
        assignedUserId: anaId,
        nextStepOwnerId: brunoId,
        nextStepDescription: 'Mandar la propuesta',
        nextStepDate: dia(0),
      },
    });
    const digest = await mio(brunoId);
    expect(digest?.items[0]).toMatchObject({ kind: 'NEXT_STEP', title: 'Mandar la propuesta', subtitle: 'Cliente Recordatorio' });
    expect(await mio(anaId)).toBeUndefined();
  });

  it('si nadie quedó a cargo del paso, le toca a quien lleva la venta', async () => {
    await prisma.deal.create({
      data: {
        tenantId,
        companyId,
        title: 'Sin dueño del paso',
        amount: 100,
        currency: 'PEN',
        assignedUserId: anaId,
        nextStepDescription: 'Llamar',
        nextStepDate: dia(-1),
      },
    });
    // Sin el respaldo, este recordatorio no le llega a nadie: justo cuando más falta hace.
    expect((await mio(anaId))?.items).toHaveLength(1);
  });

  it('no recuerda el próximo paso de una venta ya cerrada o perdida', async () => {
    for (const stage of ['ENTREGADO', 'PERDIDO'] as const) {
      await prisma.deal.create({
        data: {
          tenantId, companyId, title: stage, amount: 1, currency: 'PEN', stage,
          assignedUserId: anaId, nextStepDescription: 'Ya no importa', nextStepDate: dia(-2),
        },
      });
    }
    expect(await mio(anaId)).toBeUndefined();
  });

  it('no le manda nada a una cuenta desactivada', async () => {
    await tarea(anaId, 'De una cuenta dada de baja', 0);
    await prisma.user.update({ where: { id: anaId }, data: { status: 'INACTIVE' } });
    expect(await mio(anaId)).toBeUndefined();
  });

  it('no manda dos veces el mismo día', async () => {
    await tarea(anaId, 'Una sola vez', 0);
    expect(await mio(anaId)).toBeDefined();
    await prisma.user.update({ where: { id: anaId }, data: { lastDigestAt: new Date('2026-09-15T08:00:00.000Z') } });
    // Un segundo correo idéntico enseña a ignorar los dos.
    expect(await mio(anaId)).toBeUndefined();
    await prisma.user.update({ where: { id: anaId }, data: { lastDigestAt: new Date('2026-09-14T23:00:00.000Z') } });
    expect(await mio(anaId)).toBeDefined();
  });

  describe('la puerta del cron', () => {
    it('sin secreto configurado no atiende a nadie', async () => {
      const previo = process.env.CRON_SECRET;
      delete process.env.CRON_SECRET;
      // Abierta sería un botón para mandarle correo a todos los usuarios del sistema desde afuera.
      expect((await request(app).get('/cron/reminders')).status).toBe(503);
      if (previo) process.env.CRON_SECRET = previo;
    });

    it('rechaza sin el secreto y con el secreto equivocado', async () => {
      process.env.CRON_SECRET = 'secreto-de-prueba';
      expect((await request(app).get('/cron/reminders')).status).toBe(401);
      expect(
        (await request(app).get('/cron/reminders').set('Authorization', 'Bearer otra-cosa')).status
      ).toBe(401);
      delete process.env.CRON_SECRET;
    });

    it('corre con el secreto correcto', async () => {
      process.env.CRON_SECRET = 'secreto-de-prueba';
      const res = await request(app).get('/cron/reminders').set('Authorization', 'Bearer secreto-de-prueba');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('sent');
      delete process.env.CRON_SECRET;
    });
  });
});
