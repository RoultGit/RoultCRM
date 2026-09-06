import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { signAccessToken } from '../../lib/tokens.js';

describe('/users routes', () => {
  const app = createApp();
  let tenantId: string;
  let adminToken: string;
  let vendedorToken: string;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test-access-secret';
    tenantId = (await prisma.tenant.create({ data: { name: 'Users Route Tenant' } })).id;
    adminToken = signAccessToken({ userId: 'admin-1', tenantId, role: 'ADMIN' });
    vendedorToken = signAccessToken({ userId: 'vendedor-1', tenantId, role: 'VENDEDOR' });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.user.deleteMany({ where: { tenantId } });
  });

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/users');
    expect(res.status).toBe(401);
  });

  it('lets an ADMIN create a vendedor', async () => {
    const res = await request(app)
      .post('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'new@test.com', password: 'secret123', firstName: 'New', lastName: 'Guy', role: 'VENDEDOR' });
    expect(res.status).toBe(201);
    expect(res.body.commissionPct).toBe(20);
  });

  it('rejects a VENDEDOR trying to create a user', async () => {
    const res = await request(app)
      .post('/users')
      .set('Authorization', `Bearer ${vendedorToken}`)
      .send({ email: 'new2@test.com', password: 'secret123', firstName: 'New', lastName: 'Guy', role: 'VENDEDOR' });
    expect(res.status).toBe(403);
  });

  it('lists users for the authenticated tenant', async () => {
    await request(app)
      .post('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'list@test.com', password: 'secret123', firstName: 'List', lastName: 'Me', role: 'VENDEDOR' });
    const res = await request(app).get('/users').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});
