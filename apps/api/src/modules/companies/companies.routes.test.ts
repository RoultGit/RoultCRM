import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { signAccessToken } from '../../lib/tokens.js';

describe('/companies routes', () => {
  const app = createApp();
  let tenantId: string;
  let token: string;
  let sellerAId: string;
  let sellerBId: string;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test-access-secret';
    tenantId = (await prisma.tenant.create({ data: { name: 'Companies Route Tenant' } })).id;
    token = signAccessToken({ userId: 'user-1', tenantId, role: 'ADMIN' });
    // CompaniesService valida que el vendedor asignado exista, así que estos dos son filas reales.
    sellerAId = (
      await prisma.user.create({
        data: {
          tenantId,
          email: `seller-a-${Date.now()}@roult.pe`,
          passwordHash: 'x',
          firstName: 'Ana',
          lastName: 'A',
          role: 'VENDEDOR',
        },
      })
    ).id;
    sellerBId = (
      await prisma.user.create({
        data: {
          tenantId,
          email: `seller-b-${Date.now()}@roult.pe`,
          passwordHash: 'x',
          firstName: 'Beto',
          lastName: 'B',
          role: 'VENDEDOR',
        },
      })
    ).id;
  });

  afterAll(async () => {
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
    await prisma.deal.deleteMany({ where: { tenantId } });
    await prisma.contact.deleteMany({ where: { tenantId } });
    await prisma.lead.deleteMany({ where: { tenantId } });
    await prisma.company.deleteMany({ where: { tenantId } });
  });

  describe('DELETE /companies/:id', () => {
    const createCompany = () =>
      request(app)
        .post('/companies')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Tipeada Mal SAC', line: 'WEB' })
        .then((res) => res.body.id as string);

    it('deletes an empty company and leaves the audit trail behind', async () => {
      const id = await createCompany();
      const res = await request(app).delete(`/companies/${id}`).set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(await prisma.company.findUnique({ where: { id } })).toBeNull();

      const log = await prisma.auditLog.findFirst({ where: { tenantId, entityId: id, action: 'DELETE' } });
      expect((log?.before as { name: string } | null)?.name).toBe('Tipeada Mal SAC');
    });

    it('refuses to delete a company that has deals', async () => {
      const id = await createCompany();
      await prisma.deal.create({
        data: { tenantId, companyId: id, title: 'Web corporativa', amount: '8000', currency: 'PEN' },
      });

      const res = await request(app).delete(`/companies/${id}`).set('Authorization', `Bearer ${token}`);
      // Una empresa con ventas tiene plata e historia detrás: borrarla se llevaría puestos el
      // pipeline y las comisiones. El mensaje dice cuántas ventas hay para que se pueda decidir.
      expect(res.status).toBe(409);
      expect(res.body.error).toContain('1 venta asociada');
      expect(await prisma.company.findUnique({ where: { id } })).not.toBeNull();
    });

    it('takes the contacts with it, in one transaction', async () => {
      const id = await createCompany();
      await prisma.contact.createMany({
        data: [
          { tenantId, companyId: id, name: 'Ana Quispe' },
          { tenantId, companyId: id, name: 'Luis Rojas' },
        ],
      });

      const res = await request(app).delete(`/companies/${id}`).set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.contactsDeleted).toBe(2);
      // Un contacto sin empresa es una fila rota: companyId es obligatorio y no hay a dónde moverlo.
      expect(await prisma.contact.count({ where: { companyId: id } })).toBe(0);
    });

    it('frees the converted lead instead of deleting it', async () => {
      const id = await createCompany();
      const lead = await prisma.lead.create({
        data: {
          tenantId,
          businessName: 'Tipeada Mal',
          contactName: 'Ana',
          line: 'WEB',
          status: 'CONVERTED',
          convertedCompanyId: id,
          convertedAt: new Date(),
        },
      });

      expect((await request(app).delete(`/companies/${id}`).set('Authorization', `Bearer ${token}`)).status).toBe(200);

      // El lead es la prueba de que el prospecto existió: borrarlo escondería de dónde vino el
      // error. Vuelve a Calificado, el estado justo anterior a la conversión equivocada.
      const after = await prisma.lead.findUnique({ where: { id: lead.id } });
      expect(after).not.toBeNull();
      expect(after?.status).toBe('QUALIFIED');
      expect(after?.convertedCompanyId).toBeNull();
      expect(after?.convertedAt).toBeNull();
    });

    it('does not let a vendedor delete a company', async () => {
      const id = await createCompany();
      const sellerToken = signAccessToken({ userId: sellerAId, tenantId, role: 'VENDEDOR' });
      const res = await request(app).delete(`/companies/${id}`).set('Authorization', `Bearer ${sellerToken}`);
      expect(res.status).toBe(403);
      expect(await prisma.company.findUnique({ where: { id } })).not.toBeNull();
    });

    it('does not let an admin delete a company from another tenant', async () => {
      const otherTenant = await prisma.tenant.create({ data: { name: 'Otro empresa' } });
      const otherCompany = await prisma.company.create({
        data: { tenantId: otherTenant.id, name: 'Ajena', line: 'WEB' },
      });

      const res = await request(app).delete(`/companies/${otherCompany.id}`).set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(404);
      expect(await prisma.company.findUnique({ where: { id: otherCompany.id } })).not.toBeNull();

      await prisma.company.delete({ where: { id: otherCompany.id } });
      await prisma.tenant.delete({ where: { id: otherTenant.id } });
    });
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

  it('treats blank optional fields as absent instead of rejecting them', async () => {
    const res = await request(app)
      .post('/companies')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Sin Correo SAC', line: 'WEB', email: '', whatsapp: '', city: '' });
    expect(res.status).toBe(201);
    expect(res.body.email).toBeNull();
    expect(res.body.whatsapp).toBeNull();
    expect(res.body.city).toBeNull();
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
  it('hides another vendedor\u2019s companies from a vendedor', async () => {
    const sellerA = signAccessToken({ userId: sellerAId, tenantId, role: 'VENDEDOR' });
    const sellerB = signAccessToken({ userId: sellerBId, tenantId, role: 'VENDEDOR' });

    const created = await request(app)
      .post('/companies')
      .set('Authorization', `Bearer ${sellerA}`)
      .send({ name: 'Solo de A SAC', line: 'WEB' });
    expect(created.status).toBe(201);
    expect(created.body.assignedUserId).toBe(sellerAId);

    const listB = await request(app).get('/companies').set('Authorization', `Bearer ${sellerB}`);
    expect(listB.body.map((c: { id: string }) => c.id)).not.toContain(created.body.id);

    const patchB = await request(app)
      .patch(`/companies/${created.body.id}`)
      .set('Authorization', `Bearer ${sellerB}`)
      .send({ city: 'Lima' });
    expect(patchB.status).toBe(404);
  });

  it('shows an admin every company in the tenant', async () => {
    const sellerA = signAccessToken({ userId: sellerAId, tenantId, role: 'VENDEDOR' });
    const created = await request(app)
      .post('/companies')
      .set('Authorization', `Bearer ${sellerA}`)
      .send({ name: 'Solo de A SAC', line: 'WEB' });

    const listAdmin = await request(app).get('/companies').set('Authorization', `Bearer ${token}`);
    expect(listAdmin.body.map((c: { id: string }) => c.id)).toContain(created.body.id);
  });
  it('does not leak another vendedor’s company through the duplicate warning', async () => {
    const sellerA = signAccessToken({ userId: sellerAId, tenantId, role: 'VENDEDOR' });
    const sellerB = signAccessToken({ userId: sellerBId, tenantId, role: 'VENDEDOR' });
    await request(app)
      .post('/companies')
      .set('Authorization', `Bearer ${sellerA}`)
      .send({ name: 'Cliente Secreto SAC', line: 'WEB', email: 'secreto@cliente.pe', notes: 'paga tarde' });

    // B sondea con el nombre para que el 409 le devuelva la ficha de A.
    const res = await request(app)
      .post('/companies')
      .set('Authorization', `Bearer ${sellerB}`)
      .send({ name: 'Cliente Secreto SAC', line: 'WEB' });
    expect(res.status).toBe(409);
    expect(res.body.details).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('secreto@cliente.pe');
    expect(JSON.stringify(res.body)).not.toContain('paga tarde');
    expect(JSON.stringify(res.body)).not.toContain(sellerAId);
  });

  it('still shows a vendedor their own duplicate in full', async () => {
    const sellerA = signAccessToken({ userId: sellerAId, tenantId, role: 'VENDEDOR' });
    await request(app)
      .post('/companies')
      .set('Authorization', `Bearer ${sellerA}`)
      .send({ name: 'Propia SAC', line: 'WEB' });

    const res = await request(app)
      .post('/companies')
      .set('Authorization', `Bearer ${sellerA}`)
      .send({ name: 'Propia SAC', line: 'WEB' });
    expect(res.status).toBe(409);
    expect(res.body.details.duplicate.name).toBe('Propia SAC');
  });

  it('refuses to let a vendedor reassign a company', async () => {
    const sellerA = signAccessToken({ userId: sellerAId, tenantId, role: 'VENDEDOR' });
    const created = await request(app)
      .post('/companies')
      .set('Authorization', `Bearer ${sellerA}`)
      .send({ name: 'Propia SAC', line: 'WEB' });

    const res = await request(app)
      .patch(`/companies/${created.body.id}`)
      .set('Authorization', `Bearer ${sellerA}`)
      .send({ assignedUserId: sellerBId });
    expect(res.status).toBe(403);
  });
});
