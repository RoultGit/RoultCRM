import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { signAccessToken } from '../../lib/tokens.js';

describe('fusionar dos fichas del mismo cliente', () => {
  const app = createApp();
  let tenantId: string;
  let adminToken: string;
  let sellerToken: string;
  let sellerId: string;
  let quedaId: string;
  let absorbidaId: string;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test-access-secret';
    tenantId = (await prisma.tenant.create({ data: { name: 'Fusión Tenant' } })).id;
    adminToken = signAccessToken({ userId: 'fus-admin', tenantId, role: 'ADMIN' });
    sellerId = (
      await prisma.user.create({
        data: { tenantId, email: `fus-${Date.now()}@roult.pe`, passwordHash: 'x', firstName: 'F', lastName: 'S', role: 'VENDEDOR' },
      })
    ).id;
    sellerToken = signAccessToken({ userId: sellerId, tenantId, role: 'VENDEDOR' });
  });

  afterAll(async () => {
    await prisma.activity.deleteMany({ where: { tenantId } });
    await prisma.attachment.deleteMany({ where: { tenantId } });
    await prisma.quoteItem.deleteMany({ where: { quote: { tenantId } } });
    await prisma.quote.deleteMany({ where: { tenantId } });
    await prisma.deal.deleteMany({ where: { tenantId } });
    await prisma.contact.deleteMany({ where: { tenantId } });
    await prisma.lead.deleteMany({ where: { tenantId } });
    await prisma.company.deleteMany({ where: { tenantId } });
    await prisma.auditLog.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.activity.deleteMany({ where: { tenantId } });
    await prisma.quoteItem.deleteMany({ where: { quote: { tenantId } } });
    await prisma.quote.deleteMany({ where: { tenantId } });
    await prisma.deal.deleteMany({ where: { tenantId } });
    await prisma.contact.deleteMany({ where: { tenantId } });
    await prisma.lead.deleteMany({ where: { tenantId } });
    await prisma.company.deleteMany({ where: { tenantId } });

    quedaId = (
      await prisma.company.create({
        data: { tenantId, name: 'Andina S.A.C.', line: 'WEB', assignedUserId: sellerId, city: 'Lima' },
      })
    ).id;
    absorbidaId = (
      await prisma.company.create({
        data: { tenantId, name: 'ANDINA SAC', line: 'WEB', assignedUserId: sellerId, whatsapp: '987654321', notes: 'Vino por referido' },
      })
    ).id;
  });

  const fusionar = (body: Record<string, unknown>, token = adminToken) =>
    request(app).post('/companies/merge').set('Authorization', `Bearer ${token}`).send(body);

  it('mueve todo lo de la absorbida y la hace desaparecer', async () => {
    await prisma.contact.create({ data: { tenantId, companyId: absorbidaId, name: 'Rosa' } });
    const deal = await prisma.deal.create({
      data: { tenantId, companyId: absorbidaId, title: 'Web', amount: 1000, currency: 'PEN' },
    });
    await prisma.activity.create({
      data: { tenantId, authorId: sellerId, relatedType: 'COMPANY', relatedId: absorbidaId, type: 'CALL', body: 'Llamé', occurredAt: new Date() },
    });
    await prisma.lead.create({
      data: { tenantId, businessName: 'Andina', contactName: 'x', line: 'WEB', convertedCompanyId: absorbidaId },
    });

    const res = await fusionar({ keepId: quedaId, mergeId: absorbidaId });
    expect(res.status).toBe(200);
    expect(res.body.moved).toMatchObject({ contacts: 1, deals: 1, activities: 1, leads: 1 });

    expect(await prisma.company.count({ where: { id: absorbidaId } })).toBe(0);
    expect(await prisma.contact.count({ where: { companyId: quedaId } })).toBe(1);
    expect((await prisma.deal.findUniqueOrThrow({ where: { id: deal.id } })).companyId).toBe(quedaId);
    expect(await prisma.activity.count({ where: { tenantId, relatedId: quedaId } })).toBe(1);
    // Si el lead quedara apuntando a la absorbida, diría que se convirtió en un cliente que ya no existe.
    expect(await prisma.lead.count({ where: { tenantId, convertedCompanyId: quedaId } })).toBe(1);
  });

  it('completa los huecos de la que queda con los datos de la otra', async () => {
    await fusionar({ keepId: quedaId, mergeId: absorbidaId });
    const queda = await prisma.company.findUniqueOrThrow({ where: { id: quedaId } });
    // Fusionar no puede perder el único teléfono que había cargado.
    expect(queda.whatsapp).toBe('987654321');
    expect(queda.city).toBe('Lima');
    expect(queda.notes).toContain('Vino por referido');
  });

  it('no deja fusionar una ficha consigo misma', async () => {
    expect((await fusionar({ keepId: quedaId, mergeId: quedaId })).status).toBe(400);
  });

  it('no lo hace un vendedor', async () => {
    // Toca dos carteras a la vez y borra una ficha.
    expect((await fusionar({ keepId: quedaId, mergeId: absorbidaId }, sellerToken)).status).toBe(403);
  });

  it('no se puede fusionar con una ficha de otra empresa', async () => {
    const otro = await prisma.tenant.create({ data: { name: 'Fusión Otro' } });
    const ajena = await prisma.company.create({ data: { tenantId: otro.id, name: 'Ajena', line: 'WEB' } });
    const res = await fusionar({ keepId: quedaId, mergeId: ajena.id });
    expect(res.status).toBe(404);
    expect(await prisma.company.count({ where: { id: ajena.id } })).toBe(1);
    await prisma.company.delete({ where: { id: ajena.id } });
    await prisma.tenant.delete({ where: { id: otro.id } });
  });

  it('queda registrado en la auditoría qué se fusionó con qué', async () => {
    await fusionar({ keepId: quedaId, mergeId: absorbidaId });
    const log = await prisma.auditLog.findFirst({
      where: { tenantId, entityId: absorbidaId, action: 'DELETE' },
    });
    // Una ficha que desaparece sin dejar rastro es la peor clase de borrado.
    expect(log).toBeTruthy();
    expect(JSON.stringify(log?.after)).toContain(quedaId);
  });
});
