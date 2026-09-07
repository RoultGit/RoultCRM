import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { signAccessToken } from '../../lib/tokens.js';

describe('/import routes', () => {
  const app = createApp();
  let tenantId: string;
  let token: string;
  let adminId: string;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test-access-secret';
    tenantId = (await prisma.tenant.create({ data: { name: 'Import Tenant' } })).id;
    adminId = (
      await prisma.user.create({
        data: {
          tenantId,
          email: `import-admin-${Date.now()}@roult.pe`,
          passwordHash: 'x',
          firstName: 'Import',
          lastName: 'Admin',
          role: 'ADMIN',
        },
      })
    ).id;
    token = signAccessToken({ userId: adminId, tenantId, role: 'ADMIN' });
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { tenantId } });
    await prisma.contact.deleteMany({ where: { tenantId } });
    await prisma.lead.deleteMany({ where: { tenantId } });
    await prisma.company.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.auditLog.deleteMany({ where: { tenantId } });
    await prisma.contact.deleteMany({ where: { tenantId } });
    await prisma.company.deleteMany({ where: { tenantId } });
  });

  it('rejects an unknown entity', async () => {
    const res = await request(app)
      .post('/import/pinguinos/preview')
      .set('Authorization', `Bearer ${token}`)
      .send({ rows: [] });
    expect(res.status).toBe(400);
  });

  it('refuses a vendedor', async () => {
    const seller = signAccessToken({ userId: 'seller-1', tenantId, role: 'VENDEDOR' });
    const res = await request(app)
      .post('/import/companies/preview')
      .set('Authorization', `Bearer ${seller}`)
      .send({ rows: [{ name: 'X', line: 'WEB' }] });
    expect(res.status).toBe(403);
  });

  it('marks valid rows as new', async () => {
    const res = await request(app)
      .post('/import/companies/preview')
      .set('Authorization', `Bearer ${token}`)
      .send({ rows: [{ name: 'Nueva SAC', line: 'WEB' }] });
    expect(res.status).toBe(200);
    expect(res.body.rows[0].status).toBe('NEW');
    expect(res.body.summary).toEqual({ new: 1, duplicate: 0, invalid: 0 });
  });

  it('marks rows that fail validation as invalid, with the reason', async () => {
    const res = await request(app)
      .post('/import/companies/preview')
      .set('Authorization', `Bearer ${token}`)
      .send({ rows: [{ name: '', line: 'PLASTICO' }] });
    expect(res.body.rows[0].status).toBe('INVALID');
    expect(res.body.rows[0].message).toBeTruthy();
    expect(res.body.summary.invalid).toBe(1);
  });

  it('marks rows matching an existing record as duplicates', async () => {
    await prisma.company.create({ data: { tenantId, name: 'Repetida SAC', line: 'WEB' } });
    const res = await request(app)
      .post('/import/companies/preview')
      .set('Authorization', `Bearer ${token}`)
      .send({ rows: [{ name: 'Repetida SAC', line: 'WEB' }] });
    expect(res.body.rows[0].status).toBe('DUPLICATE');
    expect(res.body.summary.duplicate).toBe(1);
  });

  it('writes nothing to the database during a preview', async () => {
    await request(app)
      .post('/import/companies/preview')
      .set('Authorization', `Bearer ${token}`)
      .send({ rows: [{ name: 'Fantasma SAC', line: 'WEB' }] });
    expect(await prisma.company.count({ where: { tenantId } })).toBe(0);
  });

  it('creates only the rows the caller asked for', async () => {
    const res = await request(app)
      .post('/import/companies/commit')
      .set('Authorization', `Bearer ${token}`)
      .send({
        rows: [
          { name: 'Una SAC', line: 'WEB' },
          { name: 'Otra SAC', line: 'SOFTWARE' },
        ],
        skipIndexes: [1],
      });
    expect(res.status).toBe(201);
    expect(res.body.created).toBe(1);
    const names = (await prisma.company.findMany({ where: { tenantId } })).map((c) => c.name);
    expect(names).toEqual(['Una SAC']);
  });

  it('writes nothing at all when one row is invalid', async () => {
    const res = await request(app)
      .post('/import/companies/commit')
      .set('Authorization', `Bearer ${token}`)
      .send({
        rows: [
          { name: 'Buena SAC', line: 'WEB' },
          { name: '', line: 'WEB' },
        ],
        skipIndexes: [],
      });
    expect(res.status).toBe(400);
    // Todo o nada: una importación a medias es peor que una que falla, porque nadie sabe qué entró.
    expect(await prisma.company.count({ where: { tenantId } })).toBe(0);
  });

  it('imports a duplicate when the caller kept it', async () => {
    await prisma.company.create({ data: { tenantId, name: 'Repetida SAC', line: 'WEB' } });
    const res = await request(app)
      .post('/import/companies/commit')
      .set('Authorization', `Bearer ${token}`)
      .send({ rows: [{ name: 'Repetida SAC', line: 'WEB' }], skipIndexes: [] });
    expect(res.status).toBe(201);
    expect(await prisma.company.count({ where: { tenantId } })).toBe(2);
  });

  it('ignores a tenantId column in the CSV', async () => {
    const otherTenant = await prisma.tenant.create({ data: { name: 'Ajeno Import' } });
    const res = await request(app)
      .post('/import/companies/commit')
      .set('Authorization', `Bearer ${token}`)
      .send({ rows: [{ name: 'Colada SAC', line: 'WEB', tenantId: otherTenant.id }], skipIndexes: [] });
    expect(res.status).toBe(201);
    // El tenantId sale del JWT, no del archivo.
    expect(await prisma.company.count({ where: { tenantId: otherTenant.id } })).toBe(0);
    expect(await prisma.company.count({ where: { tenantId } })).toBe(1);
    await prisma.tenant.delete({ where: { id: otherTenant.id } });
  });

  it('records the import in the audit log', async () => {
    await request(app)
      .post('/import/companies/commit')
      .set('Authorization', `Bearer ${token}`)
      .send({ rows: [{ name: 'Auditada SAC', line: 'WEB' }], skipIndexes: [] });
    const logs = await prisma.auditLog.findMany({ where: { tenantId, action: 'CREATE' } });
    expect(logs).toHaveLength(1);
    expect(logs[0].userId).toBe(adminId);
  });

  it('rejects a file over the row cap', async () => {
    const rows = Array.from({ length: 1001 }, (_, i) => ({ name: `SAC ${i}`, line: 'WEB' }));
    const res = await request(app)
      .post('/import/companies/commit')
      .set('Authorization', `Bearer ${token}`)
      .send({ rows, skipIndexes: [] });
    expect(res.status).toBe(400);
  });
  // Contactos y leads no tenían ningún test: la fuga entre tenants vivía justo ahí.
  describe('contacts', () => {
    let companyId: string;
    let otherTenantId: string;
    let otherCompanyId: string;

    beforeEach(async () => {
      await prisma.contact.deleteMany({ where: { tenantId } });
      companyId = (await prisma.company.create({ data: { tenantId, name: 'Propia SAC', line: 'WEB' } })).id;
      otherTenantId = (await prisma.tenant.create({ data: { name: `Ajeno ${Date.now()}` } })).id;
      otherCompanyId = (
        await prisma.company.create({ data: { tenantId: otherTenantId, name: 'Ajena SAC', line: 'WEB' } })
      ).id;
    });

    afterEach(async () => {
      await prisma.contact.deleteMany({ where: { tenantId: otherTenantId } });
      await prisma.company.deleteMany({ where: { tenantId: otherTenantId } });
      await prisma.tenant.delete({ where: { id: otherTenantId } });
    });

    it('imports a contact into a company of the caller’s tenant', async () => {
      const res = await request(app)
        .post('/import/contacts/commit')
        .set('Authorization', `Bearer ${token}`)
        .send({ rows: [{ companyId, name: 'Carlos' }], skipIndexes: [] });
      expect(res.status).toBe(201);
      expect(res.body.created).toBe(1);
    });

    it('refuses a contact pointing at another tenant’s company', async () => {
      const preview = await request(app)
        .post('/import/contacts/preview')
        .set('Authorization', `Bearer ${token}`)
        .send({ rows: [{ companyId: otherCompanyId, name: 'Colado' }] });
      expect(preview.body.rows[0].status).toBe('INVALID');

      const res = await request(app)
        .post('/import/contacts/commit')
        .set('Authorization', `Bearer ${token}`)
        .send({ rows: [{ companyId: otherCompanyId, name: 'Colado' }], skipIndexes: [] });
      expect(res.status).toBe(400);
      expect(await prisma.contact.count({ where: { tenantId } })).toBe(0);
    });

    it('flags a company id that does not exist at all, instead of dying in the commit', async () => {
      const preview = await request(app)
        .post('/import/contacts/preview')
        .set('Authorization', `Bearer ${token}`)
        .send({ rows: [{ companyId: '00000000-0000-0000-0000-000000000000', name: 'Fantasma' }] });
      expect(preview.body.rows[0].status).toBe('INVALID');
      expect(preview.body.rows[0].message).toContain('empresa');

      const res = await request(app)
        .post('/import/contacts/commit')
        .set('Authorization', `Bearer ${token}`)
        .send({
          rows: [
            { companyId, name: 'Buena' },
            { companyId: '00000000-0000-0000-0000-000000000000', name: 'Fantasma' },
          ],
          skipIndexes: [],
        });
      // 400 con el número de fila, no un 500 opaco, y sin escribir la fila buena.
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Fila 2');
      expect(await prisma.contact.count({ where: { tenantId } })).toBe(0);
    });
  });

  describe('leads', () => {
    beforeEach(async () => {
      await prisma.lead.deleteMany({ where: { tenantId } });
    });

    afterEach(async () => {
      await prisma.lead.deleteMany({ where: { tenantId } });
    });

    it('imports leads and flags an existing business name as duplicate', async () => {
      await prisma.lead.create({ data: { tenantId, businessName: 'Repetido SAC', contactName: 'X', line: 'WEB' } });

      const res = await request(app)
        .post('/import/leads/preview')
        .set('Authorization', `Bearer ${token}`)
        .send({
          rows: [
            { businessName: 'Nuevo SAC', contactName: 'Ana', line: 'WEB' },
            { businessName: 'repetido sac', contactName: 'Beto', line: 'WEB' },
          ],
        });
      expect(res.body.rows[0].status).toBe('NEW');
      // La comparación no distingue mayúsculas.
      expect(res.body.rows[1].status).toBe('DUPLICATE');
    });

    it('creates the leads it was asked for', async () => {
      const res = await request(app)
        .post('/import/leads/commit')
        .set('Authorization', `Bearer ${token}`)
        .send({ rows: [{ businessName: 'Nuevo SAC', contactName: 'Ana', line: 'WEB' }], skipIndexes: [] });
      expect(res.status).toBe(201);
      expect(await prisma.lead.count({ where: { tenantId } })).toBe(1);
    });
  });
});
