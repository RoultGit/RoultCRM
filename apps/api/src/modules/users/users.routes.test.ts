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

  it('lets an ADMIN update a user', async () => {
    const created = await request(app)
      .post('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'patch@test.com', password: 'secret123', firstName: 'Pat', lastName: 'Ch', role: 'VENDEDOR' });
    const res = await request(app)
      .patch(`/users/${created.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ firstName: 'Patricia', phone: '555-9999' });
    expect(res.status).toBe(200);
    expect(res.body.firstName).toBe('Patricia');
    expect(res.body.phone).toBe('555-9999');
  });

  it('rejects a VENDEDOR trying to update a user', async () => {
    const created = await request(app)
      .post('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'patch2@test.com', password: 'secret123', firstName: 'Pat', lastName: 'Ch', role: 'VENDEDOR' });
    const res = await request(app)
      .patch(`/users/${created.body.id}`)
      .set('Authorization', `Bearer ${vendedorToken}`)
      .send({ firstName: 'Nope' });
    expect(res.status).toBe(403);
  });

  it('lets an ADMIN deactivate a user via status route', async () => {
    const created = await request(app)
      .post('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'status@test.com', password: 'secret123', firstName: 'Stat', lastName: 'Us', role: 'VENDEDOR' });
    const res = await request(app)
      .patch(`/users/${created.body.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'INACTIVE' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('INACTIVE');
  });

  it('rejects a VENDEDOR trying to change a user status', async () => {
    const created = await request(app)
      .post('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'status2@test.com', password: 'secret123', firstName: 'Stat', lastName: 'Us', role: 'VENDEDOR' });
    const res = await request(app)
      .patch(`/users/${created.body.id}/status`)
      .set('Authorization', `Bearer ${vendedorToken}`)
      .send({ status: 'INACTIVE' });
    expect(res.status).toBe(403);
  });
});
