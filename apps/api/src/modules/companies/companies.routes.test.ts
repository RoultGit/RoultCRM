import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { signAccessToken } from '../../lib/tokens.js';

describe('/companies routes', () => {
  const app = createApp();
  let tenantId: string;
  let token: string;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test-access-secret';
    tenantId = (await prisma.tenant.create({ data: { name: 'Companies Route Tenant' } })).id;
    token = signAccessToken({ userId: 'user-1', tenantId, role: 'ADMIN' });
  });

  afterAll(async () => {
    await prisma.company.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.company.deleteMany({ where: { tenantId } });
  });

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/companies');
    expect(res.status).toBe(401);
  });

  it('creates a company', async () => {
    const res = await request(app)
      .post('/companies')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'ABC SAC', line: 'WEB', email: 'contacto@abc.com' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('ABC SAC');
  });

  it('blocks creating a company with a duplicate email and returns the existing match', async () => {
    await request(app)
      .post('/companies')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'ABC SAC', line: 'WEB', email: 'contacto@abc.com' });
    const res = await request(app)
      .post('/companies')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'ABC SAC 2', line: 'WEB', email: 'contacto@abc.com' });
    expect(res.status).toBe(409);
    expect(res.body.details.duplicate.name).toBe('ABC SAC');
  });

  it('creates the company anyway when confirmDuplicate is true', async () => {
    await request(app)
      .post('/companies')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'ABC SAC', line: 'WEB', email: 'contacto@abc.com' });
    const res = await request(app)
      .post('/companies')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'ABC SAC 2', line: 'WEB', email: 'contacto@abc.com', confirmDuplicate: true });
    expect(res.status).toBe(201);
  });

  it('rejects an assignedUserId that does not belong to the tenant', async () => {
    const res = await request(app)
      .post('/companies')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'XYZ SAC', line: 'SOFTWARE', assignedUserId: 'nonexistent-user' });
    expect(res.status).toBe(404);
  });

  it('lists only companies for the authenticated tenant', async () => {
    await request(app).post('/companies').set('Authorization', `Bearer ${token}`).send({ name: 'One', line: 'WEB' });
    const res = await request(app).get('/companies').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it('updates a company', async () => {
    const created = await request(app)
      .post('/companies')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'One', line: 'WEB' });
    const res = await request(app)
      .patch(`/companies/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ city: 'Lima' });
    expect(res.status).toBe(200);
    expect(res.body.city).toBe('Lima');
  });
});
