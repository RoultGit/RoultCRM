import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { signAccessToken } from '../../lib/tokens.js';

describe('/activities routes', () => {
  const app = createApp();
  let tenantId: string;
  let adminToken: string;
  let sellerToken: string;
  let sellerId: string;
  let miCompanyId: string;
  let ajenaCompanyId: string;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test-access-secret';
    tenantId = (await prisma.tenant.create({ data: { name: 'Activities Tenant' } })).id;
    adminToken = signAccessToken({ userId: 'admin-1', tenantId, role: 'ADMIN' });
    sellerId = (
      await prisma.user.create({
        data: {
          tenantId,
          email: `act-seller-${Date.now()}@roult.pe`,
          passwordHash: 'x',
          firstName: 'Act',
          lastName: 'Seller',
          role: 'VENDEDOR',
        },
      })
    ).id;
    sellerToken = signAccessToken({ userId: sellerId, tenantId, role: 'VENDEDOR' });
  });

  afterAll(async () => {
    await prisma.activity.deleteMany({ where: { tenantId } });
    await prisma.contact.deleteMany({ where: { tenantId } });
    await prisma.deal.deleteMany({ where: { tenantId } });
    await prisma.company.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.activity.deleteMany({ where: { tenantId } });
    await prisma.contact.deleteMany({ where: { tenantId } });
    await prisma.deal.deleteMany({ where: { tenantId } });
    await prisma.company.deleteMany({ where: { tenantId } });
    miCompanyId = (
      await prisma.company.create({ data: { tenantId, name: 'Del vendedor', line: 'WEB', assignedUserId: sellerId } })
    ).id;
    ajenaCompanyId = (
      await prisma.company.create({ data: { tenantId, name: 'Del admin', line: 'WEB', assignedUserId: 'admin-1' } })
    ).id;
  });

  const log = (token: string, body: Record<string, unknown>) =>
    request(app).post('/activities').set('Authorization', `Bearer ${token}`).send(body);
  const list = (token: string, relatedType: string, relatedId: string) =>
    request(app).get(`/activities?relatedType=${relatedType}&relatedId=${relatedId}`).set('Authorization', `Bearer ${token}`);

  it('rejects unauthenticated requests', async () => {
    expect((await request(app).get('/activities?relatedType=COMPANY&relatedId=x')).status).toBe(401);
  });

  it('demands a related record', async () => {
    expect((await request(app).get('/activities').set('Authorization', `Bearer ${adminToken}`)).status).toBe(400);
  });

  it('logs an interaction against a company', async () => {
    const res = await log(sellerToken, {
      relatedType: 'COMPANY',
      relatedId: miCompanyId,
      type: 'CALL',
      body: 'Llamé y quedaron en mandar el RUC',
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ type: 'CALL', authorId: sellerId });
    expect(res.body.occurredAt).toBeTruthy();
  });

  it('signs with the token, not the body', async () => {
    const res = await log(sellerToken, {
      relatedType: 'COMPANY',
      relatedId: miCompanyId,
      type: 'NOTE',
      body: 'Firmada por otro',
      authorId: 'admin-1',
    });
    // Si el autor viniera del body, cualquiera podría firmar con otro nombre una llamada que no hizo.
    expect(res.body.authorId).toBe(sellerId);
  });

  it('orders by when it happened, not by when it was typed', async () => {
    const viernes = '2026-09-04T15:00:00.000Z';
    const lunes = '2026-09-07T09:00:00.000Z';
    // Se carga primero el lunes y después el viernes, como pasa en la vida real.
    await log(sellerToken, { relatedType: 'COMPANY', relatedId: miCompanyId, type: 'NOTE', body: 'Lunes', occurredAt: lunes });
    await log(sellerToken, { relatedType: 'COMPANY', relatedId: miCompanyId, type: 'CALL', body: 'Viernes', occurredAt: viernes });

    const res = await list(sellerToken, 'COMPANY', miCompanyId);
    expect(res.body.map((a: { body: string }) => a.body)).toEqual(['Lunes', 'Viernes']);
  });

  it('keeps each record history separate', async () => {
    const deal = await prisma.deal.create({
      data: { tenantId, companyId: miCompanyId, title: 'Web', amount: '1000', currency: 'PEN', assignedUserId: sellerId },
    });
    await log(sellerToken, { relatedType: 'COMPANY', relatedId: miCompanyId, type: 'NOTE', body: 'De la empresa' });
    await log(sellerToken, { relatedType: 'DEAL', relatedId: deal.id, type: 'NOTE', body: 'De la venta' });

    expect((await list(sellerToken, 'COMPANY', miCompanyId)).body).toHaveLength(1);
    expect((await list(sellerToken, 'DEAL', deal.id)).body[0].body).toBe('De la venta');
  });

  it('does not let a vendedor read or write the history of a record that is not theirs', async () => {
    await log(adminToken, { relatedType: 'COMPANY', relatedId: ajenaCompanyId, type: 'CALL', body: 'Privada' });

    // La tabla guarda relatedId suelto, sin clave foránea: si no se preguntara por el registro
    // dueño, cualquiera con un id podría leer la historia de un cliente ajeno.
    expect((await list(sellerToken, 'COMPANY', ajenaCompanyId)).status).toBe(404);
    expect(
      (await log(sellerToken, { relatedType: 'COMPANY', relatedId: ajenaCompanyId, type: 'NOTE', body: 'Intruso' }))
        .status
    ).toBe(404);
    expect(await prisma.activity.count({ where: { relatedId: ajenaCompanyId } })).toBe(1);
  });

  it('lets a vendedor log against a contact of their own company', async () => {
    const contact = await prisma.contact.create({ data: { tenantId, companyId: miCompanyId, name: 'Ana' } });
    // El contacto no tiene dueño propio: hereda el de su empresa.
    expect(
      (await log(sellerToken, { relatedType: 'CONTACT', relatedId: contact.id, type: 'WHATSAPP', body: 'Le escribí' }))
        .status
    ).toBe(201);
  });

  it('blocks a contact whose company belongs to someone else', async () => {
    const contact = await prisma.contact.create({ data: { tenantId, companyId: ajenaCompanyId, name: 'Ajeno' } });
    expect(
      (await log(sellerToken, { relatedType: 'CONTACT', relatedId: contact.id, type: 'NOTE', body: 'Intruso' })).status
    ).toBe(404);
  });

  it('does not cross entities', async () => {
    const otherTenant = await prisma.tenant.create({ data: { name: 'Otra empresa act' } });
    const ajena = await prisma.company.create({ data: { tenantId: otherTenant.id, name: 'Total ajena', line: 'WEB' } });

    expect((await list(adminToken, 'COMPANY', ajena.id)).status).toBe(404);
    expect(
      (await log(adminToken, { relatedType: 'COMPANY', relatedId: ajena.id, type: 'NOTE', body: 'x' })).status
    ).toBe(404);

    await prisma.company.delete({ where: { id: ajena.id } });
    await prisma.tenant.delete({ where: { id: otherTenant.id } });
  });

  it('demands a body: an empty interaction says nothing', async () => {
    const res = await log(sellerToken, { relatedType: 'COMPANY', relatedId: miCompanyId, type: 'NOTE', body: '' });
    expect(res.status).toBe(400);
  });
});
