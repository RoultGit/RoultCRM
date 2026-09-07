import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { signAccessToken } from '../../lib/tokens.js';

describe('/audit routes', () => {
  const app = createApp();
  let tenantId: string;
  let adminToken: string;
  let userId: string;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test-access-secret';
    tenantId = (await prisma.tenant.create({ data: { name: 'Audit Route Tenant' } })).id;
    userId = (
      await prisma.user.create({
        data: {
          tenantId,
          email: `audit-route-${Date.now()}@roult.pe`,
          passwordHash: 'x',
          firstName: 'Admin',
          lastName: 'Uno',
          role: 'ADMIN',
        },
      })
    ).id;
    adminToken = signAccessToken({ userId, tenantId, role: 'ADMIN' });
    await prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        action: 'ASSIGN',
        entityType: 'DEAL',
        entityId: 'deal-1',
        before: { assignedUserId: null },
        after: { assignedUserId: 'seller-9' },
      },
    });
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  it('rejects unauthenticated requests', async () => {
    expect((await request(app).get('/audit')).status).toBe(401);
  });

  it('refuses a vendedor', async () => {
    const seller = signAccessToken({ userId: 'seller-1', tenantId, role: 'VENDEDOR' });
    expect((await request(app).get('/audit').set('Authorization', `Bearer ${seller}`)).status).toBe(403);
  });

  it('returns the log with the actor’s name resolved', async () => {
    const res = await request(app).get('/audit').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body[0].action).toBe('ASSIGN');
    expect(res.body[0].userName).toBe('Admin Uno');
    expect(res.body[0].after).toEqual({ assignedUserId: 'seller-9' });
  });

  it('does not show another tenant’s log', async () => {
    const otherTenant = await prisma.tenant.create({ data: { name: 'Otro Audit' } });
    const otherUser = await prisma.user.create({
      data: {
        tenantId: otherTenant.id,
        email: `audit-other-${Date.now()}@roult.pe`,
        passwordHash: 'x',
        firstName: 'Ajeno',
        lastName: 'Admin',
        role: 'ADMIN',
      },
    });
    await prisma.auditLog.create({
      data: { tenantId: otherTenant.id, userId: otherUser.id, action: 'CREATE', entityType: 'LEAD', entityId: 'x' },
    });

    const res = await request(app).get('/audit').set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.every((e: { userName: string }) => e.userName !== 'Ajeno Admin')).toBe(true);

    await prisma.auditLog.deleteMany({ where: { tenantId: otherTenant.id } });
    await prisma.user.delete({ where: { id: otherUser.id } });
    await prisma.tenant.delete({ where: { id: otherTenant.id } });
  });
});
