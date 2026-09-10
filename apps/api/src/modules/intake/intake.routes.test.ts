import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { signAccessToken } from '../../lib/tokens.js';

describe('/intake — puerta de entrada de leads', () => {
  const app = createApp();
  let tenantId: string;
  let otroTenantId: string;
  let adminToken: string;
  let sellerToken: string;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test-access-secret';
    process.env.JWT_REFRESH_PEPPER = process.env.JWT_REFRESH_PEPPER ?? 'test-refresh-pepper';
    tenantId = (await prisma.tenant.create({ data: { name: 'Intake Tenant' } })).id;
    otroTenantId = (await prisma.tenant.create({ data: { name: 'Intake Otro' } })).id;
    adminToken = signAccessToken({ userId: 'admin-1', tenantId, role: 'ADMIN' });
    sellerToken = signAccessToken({ userId: 'seller-1', tenantId, role: 'VENDEDOR' });
  });

  afterAll(async () => {
    for (const id of [tenantId, otroTenantId]) {
      await prisma.lead.deleteMany({ where: { tenantId: id } });
      await prisma.apiKey.deleteMany({ where: { tenantId: id } });
      await prisma.auditLog.deleteMany({ where: { tenantId: id } });
      await prisma.tenant.delete({ where: { id } });
    }
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    for (const id of [tenantId, otroTenantId]) {
      await prisma.lead.deleteMany({ where: { tenantId: id } });
      await prisma.apiKey.deleteMany({ where: { tenantId: id } });
    }
  });

  const newKey = async (token = adminToken, name = 'Formulario del sitio') =>
    (await request(app).post('/intake/keys').set('Authorization', `Bearer ${token}`).send({ name })).body;

  const capture = (key: string | null, body: Record<string, unknown>) => {
    const req = request(app).post('/intake/leads');
    if (key) req.set('X-API-Key', key);
    return req.send(body);
  };

  const lead = { businessName: 'Vino de la web SAC', contactName: 'Ana Quispe', line: 'WEB' };

  describe('claves', () => {
    it('does not let a VENDEDOR create or list keys', async () => {
      // Una clave abre la puerta de entrada de la empresa: no es algo que un vendedor deba crear.
      expect((await request(app).get('/intake/keys').set('Authorization', `Bearer ${sellerToken}`)).status).toBe(403);
      expect(
        (await request(app).post('/intake/keys').set('Authorization', `Bearer ${sellerToken}`).send({ name: 'x' }))
          .status
      ).toBe(403);
    });

    it('returns the key once and never stores it in the clear', async () => {
      const created = await newKey();
      expect(created.key).toMatch(/^rk_[a-f0-9]{64}$/);

      const row = await prisma.apiKey.findFirstOrThrow({ where: { tenantId } });
      expect(row.keyHash).not.toContain(created.key);
      expect(row.keyHash).toMatch(/^[a-f0-9]{64}$/);
      // Solo los últimos 4, para reconocerla en la lista sin guardarla entera.
      expect(row.lastFour).toBe(created.key.slice(-4));

      const listed = await request(app).get('/intake/keys').set('Authorization', `Bearer ${adminToken}`);
      expect(JSON.stringify(listed.body)).not.toContain(created.key);
    });

    it('never writes the key into the audit log', async () => {
      const created = await newKey();
      const log = await prisma.auditLog.findFirst({ where: { tenantId, entityId: created.id } });
      expect(JSON.stringify(log?.after)).not.toContain(created.key);
    });
  });

  describe('capturar el lead', () => {
    it('creates the lead in the entity that owns the key', async () => {
      const { key } = await newKey();
      const res = await capture(key, lead);
      expect(res.status).toBe(201);

      // De qué empresa es el lead lo decide la CLAVE. Si no, un formulario podría cargar leads en la
      // cartera de otro cliente.
      const saved = await prisma.lead.findFirstOrThrow({ where: { businessName: 'Vino de la web SAC' } });
      expect(saved.tenantId).toBe(tenantId);
      expect(await prisma.lead.count({ where: { tenantId: otroTenantId } })).toBe(0);
    });

    it('leaves the lead unassigned and marks its source', async () => {
      const { key } = await newKey();
      const res = await capture(key, lead);
      // Asignarlo al azar lo haría aparecer en la lista de alguien que no sabe de dónde salió.
      expect(res.body.assignedUserId).toBeNull();
      expect(res.body.status).toBe('NEW');
      expect(res.body.source).toBe('Web');
    });

    it('respects an explicit source', async () => {
      const { key } = await newKey();
      const res = await capture(key, { ...lead, source: 'Instagram' });
      expect(res.body.source).toBe('Instagram');
    });

    it('refuses a missing, invented or revoked key', async () => {
      expect((await capture(null, lead)).status).toBe(401);
      expect((await capture('rk_' + 'f'.repeat(64), lead)).status).toBe(401);

      const created = await newKey();
      await request(app).delete(`/intake/keys/${created.id}`).set('Authorization', `Bearer ${adminToken}`);
      expect((await capture(created.key, lead)).status).toBe(401);
      expect(await prisma.lead.count({ where: { tenantId } })).toBe(0);
    });

    it('validates the payload like any other lead', async () => {
      const { key } = await newKey();
      expect((await capture(key, { contactName: 'Sin empresa', line: 'WEB' })).status).toBe(400);
      expect((await capture(key, { ...lead, line: 'INVENTADA' })).status).toBe(400);
      expect((await capture(key, { ...lead, email: 'no-es-un-correo' })).status).toBe(400);
    });

    it('records that the key was used, so a mute form is visible', async () => {
      const { key, id } = await newKey();
      expect((await prisma.apiKey.findUniqueOrThrow({ where: { id } })).lastUsedAt).toBeNull();
      await capture(key, lead);
      expect((await prisma.apiKey.findUniqueOrThrow({ where: { id } })).lastUsedAt).not.toBeNull();
    });

    it('answers CORS for any origin, without credentials', async () => {
      const { key } = await newKey();
      const res = await capture(key, lead).set('Origin', 'https://el-sitio-del-cliente.pe');
      // El formulario vive en otro dominio: sin CORS abierto, el navegador lo bloquea. Sin
      // credentials, para que no viaje ninguna cookie de sesión.
      expect(res.headers['access-control-allow-origin']).toBe('https://el-sitio-del-cliente.pe');
      expect(res.headers['access-control-allow-credentials']).toBeUndefined();
    });

    it('does not open the rest of the API with the key', async () => {
      const { key } = await newKey();
      // La clave sirve para UNA cosa. Si abriera el resto, filtrarla en el HTML de un sitio
      // entregaría la cartera entera de clientes.
      for (const path of ['/leads', '/companies', '/deals', '/users']) {
        expect((await request(app).get(path).set('X-API-Key', key)).status).toBe(401);
      }
    });
  });
});
