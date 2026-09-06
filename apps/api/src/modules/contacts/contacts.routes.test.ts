import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { signAccessToken } from '../../lib/tokens.js';

describe('/contacts routes', () => {
  const app = createApp();
  let tenantId: string;
  let token: string;
  let companyId: string;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test-access-secret';
    tenantId = (await prisma.tenant.create({ data: { name: 'Contacts Route Tenant' } })).id;
    token = signAccessToken({ userId: 'user-1', tenantId, role: 'ADMIN' });
    companyId = (await prisma.company.create({ data: { tenantId, name: 'ABC SAC', line: 'WEB' } })).id;
  });

  afterAll(async () => {
    await prisma.contact.deleteMany({ where: { tenantId } });
    await prisma.company.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.contact.deleteMany({ where: { tenantId } });
  });

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/contacts');
    expect(res.status).toBe(401);
  });

  it('creates a contact under an existing company', async () => {
    const res = await request(app)
      .post('/contacts')
      .set('Authorization', `Bearer ${token}`)
      .send({ companyId, name: 'Carlos Pérez', email: 'carlos@abc.com' });
    expect(res.status).toBe(201);
    expect(res.body.companyName).toBe('ABC SAC');
  });

  it('rejects a companyId that does not belong to the tenant', async () => {
    const res = await request(app)
      .post('/contacts')
      .set('Authorization', `Bearer ${token}`)
      .send({ companyId: 'nonexistent-company', name: 'Nadie' });
    expect(res.status).toBe(404);
  });

  it('blocks a duplicate contact (same company + email) and allows override', async () => {
    await request(app)
      .post('/contacts')
      .set('Authorization', `Bearer ${token}`)
      .send({ companyId, name: 'Carlos Pérez', email: 'carlos@abc.com' });
    const blocked = await request(app)
      .post('/contacts')
      .set('Authorization', `Bearer ${token}`)
      .send({ companyId, name: 'Carlos P.', email: 'carlos@abc.com' });
    expect(blocked.status).toBe(409);

    const forced = await request(app)
      .post('/contacts')
      .set('Authorization', `Bearer ${token}`)
      .send({ companyId, name: 'Carlos P.', email: 'carlos@abc.com', confirmDuplicate: true });
    expect(forced.status).toBe(201);
  });

  it('lists contacts for the authenticated tenant with the company name included', async () => {
    await request(app).post('/contacts').set('Authorization', `Bearer ${token}`).send({ companyId, name: 'Contact One' });
    const res = await request(app).get('/contacts').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body[0].companyName).toBe('ABC SAC');
  });

  it('updates a contact', async () => {
    const created = await request(app)
      .post('/contacts')
      .set('Authorization', `Bearer ${token}`)
      .send({ companyId, name: 'Contact One' });
    const res = await request(app)
      .patch(`/contacts/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ position: 'Gerente' });
    expect(res.status).toBe(200);
    expect(res.body.position).toBe('Gerente');
  });
});
