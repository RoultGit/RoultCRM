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
  // Contactos es el único módulo donde el filtro de dueño es una consulta relacional (por la
  // empresa) en vez de un campo plano, así que es el que más necesita cobertura propia.
  it('hides the contacts of another vendedor’s company', async () => {
    const sellerA = signAccessToken({ userId: 'seller-a', tenantId, role: 'VENDEDOR' });
    const sellerB = signAccessToken({ userId: 'seller-b', tenantId, role: 'VENDEDOR' });
    const companyOfA = await prisma.company.create({
      data: { tenantId, name: 'Empresa de A', line: 'WEB', assignedUserId: 'seller-a' },
    });

    const created = await request(app)
      .post('/contacts')
      .set('Authorization', `Bearer ${sellerA}`)
      .send({ companyId: companyOfA.id, name: 'Contacto de A' });
    expect(created.status).toBe(201);

    const listB = await request(app).get('/contacts').set('Authorization', `Bearer ${sellerB}`);
    expect(listB.body.map((c: { id: string }) => c.id)).not.toContain(created.body.id);

    const listA = await request(app).get('/contacts').set('Authorization', `Bearer ${sellerA}`);
    expect(listA.body.map((c: { id: string }) => c.id)).toContain(created.body.id);

    const patchB = await request(app)
      .patch(`/contacts/${created.body.id}`)
      .set('Authorization', `Bearer ${sellerB}`)
      .send({ position: 'Gerente' });
    expect(patchB.status).toBe(404);

    await prisma.contact.deleteMany({ where: { companyId: companyOfA.id } });
    await prisma.company.delete({ where: { id: companyOfA.id } });
  });

  it('refuses to hang a contact off another vendedor’s company', async () => {
    const sellerB = signAccessToken({ userId: 'seller-b', tenantId, role: 'VENDEDOR' });
    const companyOfA = await prisma.company.create({
      data: { tenantId, name: 'Empresa de A', line: 'WEB', assignedUserId: 'seller-a' },
    });

    const res = await request(app)
      .post('/contacts')
      .set('Authorization', `Bearer ${sellerB}`)
      .send({ companyId: companyOfA.id, name: 'Colado' });
    expect(res.status).toBe(404);

    await prisma.company.delete({ where: { id: companyOfA.id } });
  });

  it('does not leak another vendedor’s contact through the duplicate warning', async () => {
    const sellerA = signAccessToken({ userId: 'seller-a', tenantId, role: 'VENDEDOR' });
    const sellerB = signAccessToken({ userId: 'seller-b', tenantId, role: 'VENDEDOR' });
    const companyOfA = await prisma.company.create({
      data: { tenantId, name: 'Empresa de A', line: 'WEB', assignedUserId: 'seller-a' },
    });
    const companyOfB = await prisma.company.create({
      data: { tenantId, name: 'Empresa de B', line: 'WEB', assignedUserId: 'seller-b' },
    });
    await request(app)
      .post('/contacts')
      .set('Authorization', `Bearer ${sellerA}`)
      .send({ companyId: companyOfA.id, name: 'Secreto', email: 'secreto@a.pe', phone: '999888777' });

    // B adivina el teléfono y busca que el 409 le devuelva el contacto de A.
    const res = await request(app)
      .post('/contacts')
      .set('Authorization', `Bearer ${sellerB}`)
      .send({ companyId: companyOfB.id, name: 'Sondeo', phone: '999888777' });
    expect(res.status).toBe(409);
    expect(res.body.details).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('secreto@a.pe');
    expect(JSON.stringify(res.body)).not.toContain('Secreto');

    await prisma.contact.deleteMany({ where: { tenantId } });
    await prisma.company.delete({ where: { id: companyOfA.id } });
    await prisma.company.delete({ where: { id: companyOfB.id } });
  });
});
