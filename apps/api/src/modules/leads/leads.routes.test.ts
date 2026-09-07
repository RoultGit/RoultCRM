import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { signAccessToken } from '../../lib/tokens.js';

describe('/leads routes', () => {
  const app = createApp();
  let tenantId: string;
  let token: string;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test-access-secret';
    tenantId = (await prisma.tenant.create({ data: { name: 'Leads Route Tenant' } })).id;
    token = signAccessToken({ userId: 'user-1', tenantId, role: 'VENDEDOR' });
  });

  afterAll(async () => {
    await prisma.contact.deleteMany({ where: { tenantId } });
    await prisma.lead.deleteMany({ where: { tenantId } });
    await prisma.company.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.lead.deleteMany({ where: { tenantId } });
  });

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/leads');
    expect(res.status).toBe(401);
  });

  it('creates a lead with default status NEW', async () => {
    const res = await request(app)
      .post('/leads')
      .set('Authorization', `Bearer ${token}`)
      .send({ businessName: 'ABC SAC', contactName: 'Carlos Pérez', line: 'WEB', source: 'Referido' });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('NEW');
  });

  it('lets a VENDEDOR advance a lead through its status', async () => {
    const created = await request(app)
      .post('/leads')
      .set('Authorization', `Bearer ${token}`)
      .send({ businessName: 'ABC SAC', contactName: 'Carlos Pérez', line: 'WEB' });
    const res = await request(app)
      .patch(`/leads/${created.body.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'CONTACTED' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CONTACTED');
  });

  it('rejects setting status directly to CONVERTED', async () => {
    const created = await request(app)
      .post('/leads')
      .set('Authorization', `Bearer ${token}`)
      .send({ businessName: 'ABC SAC', contactName: 'Carlos Pérez', line: 'WEB' });
    const res = await request(app)
      .patch(`/leads/${created.body.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'CONVERTED' });
    expect(res.status).toBe(400);
  });

  it('lists leads for the authenticated tenant', async () => {
    await request(app)
      .post('/leads')
      .set('Authorization', `Bearer ${token}`)
      .send({ businessName: 'One', contactName: 'Person', line: 'WEB' });
    const res = await request(app).get('/leads').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it('updates a lead', async () => {
    const created = await request(app)
      .post('/leads')
      .set('Authorization', `Bearer ${token}`)
      .send({ businessName: 'One', contactName: 'Person', line: 'WEB' });
    const res = await request(app)
      .patch(`/leads/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ notes: 'Llamar mañana' });
    expect(res.status).toBe(200);
    expect(res.body.notes).toBe('Llamar mañana');
  });

  it('converts a lead into a Company + Contact and marks it CONVERTED', async () => {
    const created = await request(app)
      .post('/leads')
      .set('Authorization', `Bearer ${token}`)
      .send({ businessName: 'Nueva SAC', contactName: 'Ana Torres', line: 'WEB', email: 'ana@nueva.com' });
    const res = await request(app)
      .post(`/leads/${created.body.id}/convert`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(201);
    expect(res.body.lead.status).toBe('CONVERTED');
    expect(res.body.company.name).toBe('Nueva SAC');
    expect(res.body.contact.name).toBe('Ana Torres');
    expect(res.body.lead.convertedCompanyId).toBe(res.body.company.id);
  });

  it('blocks conversion when a matching company already exists, unless confirmed', async () => {
    await prisma.company.create({ data: { tenantId, name: 'Existente SAC', line: 'WEB', email: 'dup@existente.com' } });
    const created = await request(app)
      .post('/leads')
      .set('Authorization', `Bearer ${token}`)
      .send({ businessName: 'Existente SAC', contactName: 'Otra Persona', line: 'WEB', email: 'dup@existente.com' });

    const blocked = await request(app)
      .post(`/leads/${created.body.id}/convert`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(blocked.status).toBe(409);

    const forced = await request(app)
      .post(`/leads/${created.body.id}/convert`)
      .set('Authorization', `Bearer ${token}`)
      .send({ confirmDuplicate: true });
    expect(forced.status).toBe(201);
  });

  it('rejects converting an already-converted lead', async () => {
    const created = await request(app)
      .post('/leads')
      .set('Authorization', `Bearer ${token}`)
      .send({ businessName: 'Ya SAC', contactName: 'Pedro', line: 'WEB' });
    await request(app).post(`/leads/${created.body.id}/convert`).set('Authorization', `Bearer ${token}`).send({});
    const res = await request(app)
      .post(`/leads/${created.body.id}/convert`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
  });
  it('hides another vendedor\u2019s leads from a vendedor', async () => {
    const sellerA = signAccessToken({ userId: 'seller-a', tenantId, role: 'VENDEDOR' });
    const sellerB = signAccessToken({ userId: 'seller-b', tenantId, role: 'VENDEDOR' });

    const created = await request(app)
      .post('/leads')
      .set('Authorization', `Bearer ${sellerA}`)
      .send({ businessName: 'Solo de A', contactName: 'Ana', line: 'WEB' });
    expect(created.status).toBe(201);
    expect(created.body.assignedUserId).toBe('seller-a');

    const listB = await request(app).get('/leads').set('Authorization', `Bearer ${sellerB}`);
    expect(listB.status).toBe(200);
    expect(listB.body.map((l: { id: string }) => l.id)).not.toContain(created.body.id);

    const patchB = await request(app)
      .patch(`/leads/${created.body.id}`)
      .set('Authorization', `Bearer ${sellerB}`)
      .send({ notes: 'robado' });
    expect(patchB.status).toBe(404);
  });

  it('shows an admin every lead in the tenant', async () => {
    // El `token` de este archivo es de un VENDEDOR, así que el caso de admin firma el suyo.
    const adminToken = signAccessToken({ userId: 'admin-1', tenantId, role: 'ADMIN' });
    const sellerA = signAccessToken({ userId: 'seller-a', tenantId, role: 'VENDEDOR' });
    const created = await request(app)
      .post('/leads')
      .set('Authorization', `Bearer ${sellerA}`)
      .send({ businessName: 'Solo de A', contactName: 'Ana', line: 'WEB' });

    const listAdmin = await request(app).get('/leads').set('Authorization', `Bearer ${adminToken}`);
    expect(listAdmin.body.map((l: { id: string }) => l.id)).toContain(created.body.id);
  });

  it('refuses to let a vendedor reassign a lead', async () => {
    const sellerA = signAccessToken({ userId: 'seller-a', tenantId, role: 'VENDEDOR' });
    const created = await request(app)
      .post('/leads')
      .set('Authorization', `Bearer ${sellerA}`)
      .send({ businessName: 'Solo de A', contactName: 'Ana', line: 'WEB' });

    const res = await request(app)
      .patch(`/leads/${created.body.id}`)
      .set('Authorization', `Bearer ${sellerA}`)
      .send({ assignedUserId: 'seller-b' });
    expect(res.status).toBe(403);
  });
  it('filters leads by status and by line', async () => {
    const web = await request(app)
      .post('/leads')
      .set('Authorization', `Bearer ${token}`)
      .send({ businessName: 'Uno', contactName: 'A', line: 'WEB' });
    const soft = await request(app)
      .post('/leads')
      .set('Authorization', `Bearer ${token}`)
      .send({ businessName: 'Dos', contactName: 'B', line: 'SOFTWARE' });
    await request(app)
      .patch(`/leads/${soft.body.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'CONTACTED' });

    const byLine = await request(app).get('/leads?line=SOFTWARE').set('Authorization', `Bearer ${token}`);
    expect(byLine.body.map((l: { id: string }) => l.id)).toEqual([soft.body.id]);

    const byStatus = await request(app).get('/leads?status=NEW').set('Authorization', `Bearer ${token}`);
    expect(byStatus.body.map((l: { id: string }) => l.id)).toContain(web.body.id);
    expect(byStatus.body.map((l: { id: string }) => l.id)).not.toContain(soft.body.id);
  });

  it('filters leads by source, case-insensitively and partially', async () => {
    const ig = await request(app)
      .post('/leads')
      .set('Authorization', `Bearer ${token}`)
      .send({ businessName: 'Desde IG', contactName: 'C', line: 'WEB', source: 'IG - Instagram' });
    await request(app)
      .post('/leads')
      .set('Authorization', `Bearer ${token}`)
      .send({ businessName: 'Referido', contactName: 'D', line: 'WEB', source: 'Referido' });

    const res = await request(app).get('/leads?source=instagram').set('Authorization', `Bearer ${token}`);
    expect(res.body.map((l: { id: string }) => l.id)).toEqual([ig.body.id]);
  });

  it('rejects an unknown lead status filter', async () => {
    const res = await request(app).get('/leads?status=INVENTADO').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });
});
