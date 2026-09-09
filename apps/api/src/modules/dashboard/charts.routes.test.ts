import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { signAccessToken } from '../../lib/tokens.js';

function monthKey(offset: number): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

describe('/dashboard/charts', () => {
  const app = createApp();
  let tenantId: string;
  let adminToken: string;
  let sellerToken: string;
  let sellerId: string;
  let companyId: string;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test-access-secret';
    tenantId = (await prisma.tenant.create({ data: { name: 'Charts Tenant' } })).id;
    adminToken = signAccessToken({ userId: 'admin-1', tenantId, role: 'ADMIN' });
    sellerId = (
      await prisma.user.create({
        data: {
          tenantId,
          email: `charts-seller-${Date.now()}@roult.pe`,
          passwordHash: 'x',
          firstName: 'Charts',
          lastName: 'Seller',
          role: 'VENDEDOR',
        },
      })
    ).id;
    sellerToken = signAccessToken({ userId: sellerId, tenantId, role: 'VENDEDOR' });
  });

  afterAll(async () => {
    await prisma.task.deleteMany({ where: { tenantId } });
    await prisma.deal.deleteMany({ where: { tenantId } });
    await prisma.lead.deleteMany({ where: { tenantId } });
    await prisma.company.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.task.deleteMany({ where: { tenantId } });
    await prisma.deal.deleteMany({ where: { tenantId } });
    await prisma.lead.deleteMany({ where: { tenantId } });
    await prisma.company.deleteMany({ where: { tenantId } });
    companyId = (await prisma.company.create({ data: { tenantId, name: 'ABC SAC', line: 'WEB' } })).id;
  });

  const get = (token = adminToken, qs = '') =>
    request(app).get(`/dashboard/charts${qs}`).set('Authorization', `Bearer ${token}`);

  it('rejects unauthenticated requests', async () => {
    expect((await request(app).get('/dashboard/charts')).status).toBe(401);
  });

  it('returns every requested month, including the empty ones', async () => {
    const res = await get(adminToken, '?months=6');
    expect(res.status).toBe(200);
    expect(res.body.monthly).toHaveLength(6);
    // Un mes sin deals tiene que venir en cero, no faltar: si falta, el eje del gráfico se salta
    // ese mes y la caída se lee como si no hubiera existido.
    expect(res.body.monthly[0]).toMatchObject({ month: monthKey(-5), created: 0, won: 0, lost: 0 });
    expect(res.body.monthly[5].month).toBe(monthKey(0));
  });

  it('rejects a range outside the allowed window', async () => {
    expect((await get(adminToken, '?months=99')).status).toBe(400);
  });

  it('counts won deals and their PEN amount in the current month', async () => {
    await prisma.deal.createMany({
      data: [
        { tenantId, companyId, title: 'Ganado PEN', amount: '1000', currency: 'PEN', stage: 'ENTREGADO' },
        { tenantId, companyId, title: 'Ganado USD', amount: '500', currency: 'USD', stage: 'ADELANTO' },
        { tenantId, companyId, title: 'Perdido', amount: '300', currency: 'PEN', stage: 'PERDIDO' },
      ],
    });
    const res = await get();
    const current = res.body.monthly.at(-1);
    expect(current).toMatchObject({ created: 3, won: 2, lost: 1 });
    // El monto suma solo PEN: mezclarlo con USD sería inventar un tipo de cambio.
    expect(current.wonAmountPEN).toBe('1000');
  });

  it('lists every stage of the pipeline, even at zero', async () => {
    const res = await get();
    expect(res.body.pipelineByStage).toHaveLength(8);
    expect(res.body.pipelineByStage.every((s: { count: number }) => s.count === 0)).toBe(true);
  });

  it('counts tasks by priority, listing every level even at zero', async () => {
    await prisma.task.createMany({
      data: [
        { tenantId, title: 'Urgente pendiente', ownerId: 'admin-1', dueDate: new Date(), priority: 'URGENT' },
        { tenantId, title: 'Alta hecha', ownerId: 'admin-1', dueDate: new Date(), priority: 'HIGH', status: 'DONE' },
        { tenantId, title: 'Media pendiente', ownerId: 'admin-1', dueDate: new Date() },
      ],
    });

    const res = await request(app).get('/dashboard/charts').set('Authorization', `Bearer ${adminToken}`);
    const by = Object.fromEntries(
      res.body.tasksByPriority.map((row: { priority: string }) => [row.priority, row])
    );
    // Los cuatro niveles siempre: una prioridad ausente del gráfico se lee como que no existe,
    // cuando en realidad significa que no hay nada ahí.
    expect(Object.keys(by).sort()).toEqual(['HIGH', 'LOW', 'MEDIUM', 'URGENT']);
    expect(by.URGENT).toMatchObject({ pending: 1, done: 0 });
    expect(by.HIGH).toMatchObject({ pending: 0, done: 1 });
    expect(by.LOW).toMatchObject({ pending: 0, done: 0 });
  });

  it('reports who closed and who created tasks', async () => {
    // El vendedor real y no el 'admin-1' del token: el gráfico cruza contra usuarios que existen,
    // así que un id inventado no aparece — que es lo correcto, pero no sirve para probar el conteo.
    const created = await request(app)
      .post('/tasks')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ title: 'Para el gráfico', dueDate: '2026-09-30' });
    await request(app)
      .patch(`/tasks/${created.body.id}/status`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ status: 'DONE' });

    const res = await get(adminToken);
    const row = res.body.taskPeople.find((r: { userId: string }) => r.userId === sellerId);
    expect(row?.completed).toBe(1);
    expect(row?.created).toBe(1);
  });

  it('keeps a vendedor out of the team numbers', async () => {
    await prisma.deal.create({
      data: {
        tenantId,
        companyId,
        title: 'Del admin',
        amount: '9999',
        currency: 'PEN',
        stage: 'ENTREGADO',
        assignedUserId: 'admin-1',
      },
    });

    const seller = await get(sellerToken);
    // Ni la comparativa por vendedor ni los deals ajenos: si esto se rompe, un vendedor ve la
    // cartera y la facturación de sus colegas.
    expect(seller.body.bySeller).toEqual([]);
    expect(seller.body.monthly.at(-1).won).toBe(0);

    const admin = await get();
    expect(admin.body.bySeller.length).toBeGreaterThan(0);
    expect(admin.body.monthly.at(-1).won).toBe(1);
  });
});
