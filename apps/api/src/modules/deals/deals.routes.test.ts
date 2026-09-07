import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { signAccessToken } from '../../lib/tokens.js';

describe('/deals routes', () => {
  const app = createApp();
  let tenantId: string;
  let companyId: string;
  let token: string;
  let sellerId: string;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test-access-secret';
    tenantId = (await prisma.tenant.create({ data: { name: 'Deals Route Tenant' } })).id;
    token = signAccessToken({ userId: 'user-1', tenantId, role: 'ADMIN' });
    sellerId = (
      await prisma.user.create({
        data: {
          tenantId,
          email: `deals-seller-${Date.now()}@roult.pe`,
          passwordHash: 'x',
          firstName: 'Juan',
          lastName: 'Pérez',
          role: 'VENDEDOR',
        },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.assignmentHistory.deleteMany({ where: { tenantId } });
    await prisma.deal.deleteMany({ where: { tenantId } });
    await prisma.company.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.assignmentHistory.deleteMany({ where: { tenantId } });
    await prisma.deal.deleteMany({ where: { tenantId } });
    await prisma.company.deleteMany({ where: { tenantId } });
    companyId = (await prisma.company.create({ data: { tenantId, name: 'ABC SAC', line: 'WEB' } })).id;
  });

  async function createDeal(auth = token) {
    const res = await request(app)
      .post('/deals')
      .set('Authorization', `Bearer ${auth}`)
      .send({ companyId, title: 'Web corporativa', amount: '8000', currency: 'PEN' });
    return res.body;
  }

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/deals');
    expect(res.status).toBe(401);
  });

  it('creates a deal in the first stage', async () => {
    const res = await request(app)
      .post('/deals')
      .set('Authorization', `Bearer ${token}`)
      .send({ companyId, title: 'Web corporativa', amount: '8000.00', currency: 'PEN' });
    expect(res.status).toBe(201);
    expect(res.body.stage).toBe('CONTACTO');
    expect(res.body.amount).toBe('8000');
    expect(res.body.currency).toBe('PEN');
    expect(res.body.companyName).toBe('ABC SAC');
  });

  it('rejects an amount that is not money', async () => {
    const res = await request(app)
      .post('/deals')
      .set('Authorization', `Bearer ${token}`)
      .send({ companyId, title: 'Web corporativa', amount: '8000.999', currency: 'PEN' });
    expect(res.status).toBe(400);
  });

  it('rejects a deal on a company from another tenant', async () => {
    const otherTenant = await prisma.tenant.create({ data: { name: 'Otro' } });
    const otherCompany = await prisma.company.create({
      data: { tenantId: otherTenant.id, name: 'Ajena', line: 'WEB' },
    });
    const res = await request(app)
      .post('/deals')
      .set('Authorization', `Bearer ${token}`)
      .send({ companyId: otherCompany.id, title: 'X', amount: '1', currency: 'PEN' });
    expect(res.status).toBe(404);
    await prisma.company.delete({ where: { id: otherCompany.id } });
    await prisma.tenant.delete({ where: { id: otherTenant.id } });
  });

  it('saves the next step on a deal', async () => {
    const deal = await createDeal();
    const res = await request(app)
      .patch(`/deals/${deal.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        nextStepDescription: 'Llamar para confirmar propuesta',
        nextStepOwnerId: sellerId,
        nextStepDate: '2026-09-08',
      });
    expect(res.status).toBe(200);
    expect(res.body.nextStepDescription).toBe('Llamar para confirmar propuesta');
    expect(res.body.nextStepDate).toBe('2026-09-08T00:00:00.000Z');
  });

  it('moves a deal to another stage', async () => {
    const deal = await createDeal();
    const res = await request(app)
      .patch(`/deals/${deal.id}/stage`)
      .set('Authorization', `Bearer ${token}`)
      .send({ stage: 'NEGOCIACION' });
    expect(res.status).toBe(200);
    expect(res.body.stage).toBe('NEGOCIACION');
  });

  it('refuses to mark a deal lost without a reason', async () => {
    const deal = await createDeal();
    const res = await request(app)
      .patch(`/deals/${deal.id}/stage`)
      .set('Authorization', `Bearer ${token}`)
      .send({ stage: 'PERDIDO' });
    expect(res.status).toBe(400);
  });

  it('marks a deal lost with a reason and keeps the record', async () => {
    const deal = await createDeal();
    const res = await request(app)
      .patch(`/deals/${deal.id}/stage`)
      .set('Authorization', `Bearer ${token}`)
      .send({ stage: 'PERDIDO', lostReason: 'Precio fuera de presupuesto' });
    expect(res.status).toBe(200);
    expect(res.body.stage).toBe('PERDIDO');
    expect(res.body.lostReason).toBe('Precio fuera de presupuesto');

    const list = await request(app).get('/deals').set('Authorization', `Bearer ${token}`);
    expect(list.body.map((d: { id: string }) => d.id)).toContain(deal.id);
  });

  it('clears the lost reason when a lost deal is reopened', async () => {
    const deal = await createDeal();
    await request(app)
      .patch(`/deals/${deal.id}/stage`)
      .set('Authorization', `Bearer ${token}`)
      .send({ stage: 'PERDIDO', lostReason: 'Precio' });
    const res = await request(app)
      .patch(`/deals/${deal.id}/stage`)
      .set('Authorization', `Bearer ${token}`)
      .send({ stage: 'NEGOCIACION' });
    expect(res.body.stage).toBe('NEGOCIACION');
    expect(res.body.lostReason).toBeNull();
  });

  it('records an assignment change in the history', async () => {
    const deal = await createDeal();

    const res = await request(app)
      .patch(`/deals/${deal.id}/assign`)
      .set('Authorization', `Bearer ${token}`)
      .send({ assignedUserId: sellerId });
    expect(res.status).toBe(200);
    expect(res.body.assignedUserId).toBe(sellerId);

    const history = await prisma.assignmentHistory.findMany({ where: { tenantId, entityId: deal.id } });
    expect(history).toHaveLength(1);
    expect(history[0].previousUserId).toBeNull();
    expect(history[0].newUserId).toBe(sellerId);
    expect(history[0].changedById).toBe('user-1');
  });

  it('does not record an assignment that changes nothing', async () => {
    const deal = await createDeal();
    await request(app)
      .patch(`/deals/${deal.id}/assign`)
      .set('Authorization', `Bearer ${token}`)
      .send({ assignedUserId: sellerId });
    await request(app)
      .patch(`/deals/${deal.id}/assign`)
      .set('Authorization', `Bearer ${token}`)
      .send({ assignedUserId: sellerId });

    const history = await prisma.assignmentHistory.findMany({ where: { tenantId, entityId: deal.id } });
    expect(history).toHaveLength(1);
  });

  it('refuses to let a vendedor assign a deal', async () => {
    const deal = await createDeal();
    const sellerToken = signAccessToken({ userId: sellerId, tenantId, role: 'VENDEDOR' });
    const res = await request(app)
      .patch(`/deals/${deal.id}/assign`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ assignedUserId: sellerId });
    expect(res.status).toBe(403);
  });

  it('hides another vendedor’s deals from a vendedor', async () => {
    const deal = await createDeal();
    await request(app)
      .patch(`/deals/${deal.id}/assign`)
      .set('Authorization', `Bearer ${token}`)
      .send({ assignedUserId: sellerId });

    const otherSeller = signAccessToken({ userId: 'seller-other', tenantId, role: 'VENDEDOR' });
    const list = await request(app).get('/deals').set('Authorization', `Bearer ${otherSeller}`);
    expect(list.body.map((d: { id: string }) => d.id)).not.toContain(deal.id);

    const stage = await request(app)
      .patch(`/deals/${deal.id}/stage`)
      .set('Authorization', `Bearer ${otherSeller}`)
      .send({ stage: 'NEGOCIACION' });
    expect(stage.status).toBe(404);
  });
  it('filters deals by stage', async () => {
    const a = await createDeal();
    const b = await createDeal();
    await request(app)
      .patch(`/deals/${b.id}/stage`)
      .set('Authorization', `Bearer ${token}`)
      .send({ stage: 'NEGOCIACION' });

    const res = await request(app).get('/deals?stage=NEGOCIACION').set('Authorization', `Bearer ${token}`);
    const ids = res.body.map((d: { id: string }) => d.id);
    expect(ids).toContain(b.id);
    expect(ids).not.toContain(a.id);
  });

  it('filters deals by currency and by assigned vendedor', async () => {
    const pen = await createDeal();
    const usd = await request(app)
      .post('/deals')
      .set('Authorization', `Bearer ${token}`)
      .send({ companyId, title: 'En dólares', amount: '500', currency: 'USD', assignedUserId: sellerId });

    const byCurrency = await request(app).get('/deals?currency=USD').set('Authorization', `Bearer ${token}`);
    expect(byCurrency.body.map((d: { id: string }) => d.id)).toEqual([usd.body.id]);

    const bySeller = await request(app)
      .get(`/deals?assignedUserId=${sellerId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(bySeller.body.map((d: { id: string }) => d.id)).toEqual([usd.body.id]);
    expect(bySeller.body.map((d: { id: string }) => d.id)).not.toContain(pen.id);
  });

  it('filters deals by the line of their company', async () => {
    await createDeal();
    const web = await request(app).get('/deals?line=WEB').set('Authorization', `Bearer ${token}`);
    expect(web.body).toHaveLength(1);
    const software = await request(app).get('/deals?line=SOFTWARE').set('Authorization', `Bearer ${token}`);
    expect(software.body).toHaveLength(0);
  });

  it('rejects an unknown filter value instead of returning everything', async () => {
    await createDeal();
    const res = await request(app).get('/deals?stage=NO_EXISTE').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });
});
