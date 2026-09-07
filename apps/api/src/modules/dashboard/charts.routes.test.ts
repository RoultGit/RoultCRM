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
    await prisma.deal.deleteMany({ where: { tenantId } });
    await prisma.lead.deleteMany({ where: { tenantId } });
    await prisma.company.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
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
