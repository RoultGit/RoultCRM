import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { signAccessToken } from '../../lib/tokens.js';

describe('/calendar routes', () => {
  const app = createApp();
  let tenantId: string;
  let adminToken: string;
  let sellerToken: string;
  let sellerId: string;
  let companyId: string;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test-access-secret';
    tenantId = (await prisma.tenant.create({ data: { name: 'Calendar Tenant' } })).id;
    adminToken = signAccessToken({ userId: 'admin-1', tenantId, role: 'ADMIN' });
    sellerId = (
      await prisma.user.create({
        data: {
          tenantId,
          email: `cal-seller-${Date.now()}@roult.pe`,
          passwordHash: 'x',
          firstName: 'Cal',
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
    await prisma.company.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.task.deleteMany({ where: { tenantId } });
    await prisma.deal.deleteMany({ where: { tenantId } });
    await prisma.company.deleteMany({ where: { tenantId } });
    companyId = (await prisma.company.create({ data: { tenantId, name: 'ABC SAC', line: 'WEB' } })).id;
  });

  const get = (range: string, token = adminToken) =>
    request(app).get(`/calendar?${range}`).set('Authorization', `Bearer ${token}`);

  it('rejects unauthenticated requests', async () => {
    expect((await request(app).get('/calendar?from=2026-09-01&to=2026-09-30')).status).toBe(401);
  });

  it('refuses a request without a range', async () => {
    expect((await get('')).status).toBe(400);
  });

  it('merges tasks, next steps and expected closes into one feed', async () => {
    await prisma.task.create({
      data: { tenantId, title: 'Llamar a ABC', ownerId: 'admin-1', dueDate: new Date('2026-09-10T00:00:00Z'), dueTime: '09:30' },
    });
    await prisma.deal.create({
      data: {
        tenantId,
        companyId,
        title: 'Web corporativa',
        amount: '8000',
        currency: 'PEN',
        nextStepDescription: 'Mandar propuesta',
        nextStepDate: new Date('2026-09-11T00:00:00Z'),
        expectedCloseDate: new Date('2026-09-20T00:00:00Z'),
      },
    });

    const res = await get('from=2026-09-01&to=2026-09-30');
    expect(res.status).toBe(200);
    expect(res.body.map((e: { source: string }) => e.source)).toEqual(['TASK', 'DEAL_NEXT_STEP', 'DEAL_CLOSE']);
    expect(res.body[0]).toMatchObject({ title: 'Llamar a ABC', date: '2026-09-10', time: '09:30' });
    // Un deal no tiene hora: su evento es de todo el día.
    expect(res.body[1]).toMatchObject({ title: 'Mandar propuesta', date: '2026-09-11', time: null });
  });

  it('includes the last day of the range', async () => {
    await prisma.task.create({
      data: { tenantId, title: 'Justo el último día', ownerId: 'admin-1', dueDate: new Date('2026-09-30T00:00:00Z') },
    });
    const res = await get('from=2026-09-01&to=2026-09-30');
    expect(res.body).toHaveLength(1);
  });

  it('leaves out what falls outside the range', async () => {
    await prisma.task.create({
      data: { tenantId, title: 'Del mes que viene', ownerId: 'admin-1', dueDate: new Date('2026-10-01T00:00:00Z') },
    });
    expect((await get('from=2026-09-01&to=2026-09-30')).body).toHaveLength(0);
  });

  it('does not show a vendedor the tasks or deals of other people', async () => {
    await prisma.task.create({
      data: { tenantId, title: 'Tarea del admin', ownerId: 'admin-1', dueDate: new Date('2026-09-10T00:00:00Z') },
    });
    await prisma.deal.create({
      data: {
        tenantId,
        companyId,
        title: 'Deal de otro',
        amount: '1',
        currency: 'PEN',
        assignedUserId: 'admin-1',
        nextStepDate: new Date('2026-09-10T00:00:00Z'),
      },
    });
    await prisma.task.create({
      data: { tenantId, title: 'Tarea propia', ownerId: sellerId, dueDate: new Date('2026-09-10T00:00:00Z') },
    });

    const res = await get('from=2026-09-01&to=2026-09-30', sellerToken);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].title).toBe('Tarea propia');
  });
});
