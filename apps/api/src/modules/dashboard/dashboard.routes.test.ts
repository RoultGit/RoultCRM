import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { signAccessToken } from '../../lib/tokens.js';

describe('/dashboard routes', () => {
  const app = createApp();
  let tenantId: string;
  let token: string;
  let companyId: string;
  let sellerId: string;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test-access-secret';
    tenantId = (await prisma.tenant.create({ data: { name: 'Dashboard Tenant' } })).id;
    token = signAccessToken({ userId: 'admin-1', tenantId, role: 'ADMIN' });
    sellerId = (
      await prisma.user.create({
        data: {
          tenantId,
          email: `dash-seller-${Date.now()}@roult.pe`,
          passwordHash: 'x',
          firstName: 'Dash',
          lastName: 'Seller',
          role: 'VENDEDOR',
        },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.task.deleteMany({ where: { tenantId } });
    await prisma.deal.deleteMany({ where: { tenantId } });
    await prisma.lead.deleteMany({ where: { tenantId } });
    await prisma.company.deleteMany({ where: { tenantId } });
    await prisma.auditLog.deleteMany({ where: { tenantId } });
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

  it('rejects unauthenticated requests', async () => {
    expect((await request(app).get('/dashboard')).status).toBe(401);
  });

  it('splits deals into active, won and lost by stage', async () => {
    await prisma.deal.createMany({
      data: [
        { tenantId, companyId, title: 'En juego', amount: '1000', currency: 'PEN', stage: 'NEGOCIACION' },
        { tenantId, companyId, title: 'Ganado', amount: '500', currency: 'USD', stage: 'ENTREGADO' },
        { tenantId, companyId, title: 'Perdido', amount: '300', currency: 'PEN', stage: 'PERDIDO' },
      ],
    });

    const res = await request(app).get('/dashboard').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.dealsActive).toBe(1);
    expect(res.body.dealsWon).toBe(1);
    expect(res.body.dealsLost).toBe(1);
  });

  it('never adds PEN and USD together', async () => {
    await prisma.deal.createMany({
      data: [
        { tenantId, companyId, title: 'Soles', amount: '1000', currency: 'PEN', stage: 'ENTREGADO' },
        { tenantId, companyId, title: 'Dólares', amount: '500', currency: 'USD', stage: 'ENTREGADO' },
      ],
    });

    const res = await request(app).get('/dashboard').set('Authorization', `Bearer ${token}`);
    expect(res.body.wonAmount).toEqual({ PEN: '1000', USD: '500' });
  });

  it('reports zero, not null, for a currency with no deals', async () => {
    const res = await request(app).get('/dashboard').set('Authorization', `Bearer ${token}`);
    expect(res.body.wonAmount).toEqual({ PEN: '0', USD: '0' });
    expect(res.body.activeAmount).toEqual({ PEN: '0', USD: '0' });
  });

  it('counts an overdue task apart from an upcoming one', async () => {
    // Las fechas de vencimiento se guardan como medianoche UTC del día que eligió el usuario, así
    // que el fixture las arma igual. "Ayer a esta hora" no sirve: en una zona con offset negativo
    // (Lima, UTC-5) todavía cae DESPUÉS de la medianoche UTC de hoy, y no contaría como vencida.
    const now = new Date();
    const midnightUtcToday = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(midnightUtcToday - 86_400_000);
    const tomorrow = new Date(midnightUtcToday + 86_400_000);
    await prisma.task.createMany({
      data: [
        { tenantId, title: 'Vencida', ownerId: 'admin-1', dueDate: yesterday },
        { tenantId, title: 'Próxima', ownerId: 'admin-1', dueDate: tomorrow },
        { tenantId, title: 'Hecha y vencida', ownerId: 'admin-1', dueDate: yesterday, done: true },
      ],
    });

    const res = await request(app).get('/dashboard').set('Authorization', `Bearer ${token}`);
    expect(res.body.tasksOverdue).toBe(1);
    expect(res.body.tasksUpcoming).toBe(1);
  });

  it('shows a vendedor only their own numbers', async () => {
    await prisma.deal.create({
      data: { tenantId, companyId, title: 'Del admin', amount: '1000', currency: 'PEN', stage: 'NEGOCIACION' },
    });
    await prisma.lead.create({
      data: { tenantId, businessName: 'Del admin', contactName: 'X', line: 'WEB' },
    });

    const seller = signAccessToken({ userId: sellerId, tenantId, role: 'VENDEDOR' });
    const res = await request(app).get('/dashboard').set('Authorization', `Bearer ${seller}`);
    expect(res.body.dealsActive).toBe(0);
    expect(res.body.leadsNew).toBe(0);
    expect(res.body.clientsActive).toBe(0);
    expect(res.body.activeAmount).toEqual({ PEN: '0', USD: '0' });
  });
});
