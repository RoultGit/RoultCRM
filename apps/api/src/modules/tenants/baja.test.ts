import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { signAccessToken } from '../../lib/tokens.js';

describe('dar de baja una empresa cliente', () => {
  const app = createApp();
  let miTenant: string;
  let dueñoToken: string;
  let clienteId: string;
  let clienteAdminEmail: string;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test-access-secret';
    miTenant = (await prisma.tenant.create({ data: { name: 'Baja Plataforma' } })).id;
    dueñoToken = signAccessToken({ userId: 'baja-dueño', tenantId: miTenant, role: 'ADMIN', isPlatformOwner: true });
  });

  afterAll(async () => {
    // En orden: el tenant tiene clave foránea desde User, y User desde RefreshToken.
    await prisma.auditLog.deleteMany({ where: { tenantId: miTenant } });
    await prisma.refreshToken.deleteMany({ where: { user: { tenant: { name: { startsWith: 'Baja ' } } } } });
    await prisma.user.deleteMany({ where: { tenant: { name: { startsWith: 'Baja ' } } } });
    await prisma.tenant.deleteMany({ where: { name: { startsWith: 'Baja ' } } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // RefreshToken lleva tenantId como columna suelta, sin relación, así que se busca por el
    // usuario, que sí la tiene.
    await prisma.refreshToken.deleteMany({ where: { user: { tenant: { name: { startsWith: 'Baja Cliente' } } } } });
    await prisma.user.deleteMany({ where: { tenant: { name: { startsWith: 'Baja Cliente' } } } });
    await prisma.tenant.deleteMany({ where: { name: { startsWith: 'Baja Cliente' } } });

    clienteAdminEmail = `baja-${Date.now()}@cliente.pe`;
    const creada = await request(app)
      .post('/tenants')
      .set('Authorization', `Bearer ${dueñoToken}`)
      .send({ name: 'Baja Cliente SAC', adminEmail: clienteAdminEmail, adminFirstName: 'A', adminLastName: 'B' });
    clienteId = creada.body.tenant.id;
  });

  const suspender = (suspended: boolean, token = dueñoToken) =>
    request(app).patch(`/tenants/${clienteId}/suspend`).set('Authorization', `Bearer ${token}`).send({ suspended });

  describe('suspender', () => {
    it('deja a todos afuera pero conserva los datos', async () => {
      const empresa = await prisma.company.create({ data: { tenantId: clienteId, name: 'Su cliente', line: 'WEB' } });
      const res = await suspender(true);
      expect(res.status).toBe(200);
      expect(res.body.users).toBe(1);

      const usuarios = await prisma.user.findMany({ where: { tenantId: clienteId } });
      expect(usuarios.every((u) => u.status === 'INACTIVE')).toBe(true);
      // Suspender no es borrar: el cliente vuelve, o pide sus datos, o reclama.
      expect(await prisma.company.count({ where: { id: empresa.id } })).toBe(1);
    });

    it('corta las sesiones abiertas', async () => {
      await prisma.refreshToken.create({
        data: {
          tenantId: clienteId,
          userId: (await prisma.user.findFirstOrThrow({ where: { tenantId: clienteId } })).id,
          tokenHash: 'x',
          expiresAt: new Date(Date.now() + 86_400_000),
        },
      });
      await suspender(true);
      // Sin esto, quien ya estaba adentro sigue trabajando hasta que se le venza el token.
      expect(await prisma.refreshToken.count({ where: { tenantId: clienteId } })).toBe(0);
    });

    it('se puede reactivar', async () => {
      await suspender(true);
      await suspender(false);
      const usuarios = await prisma.user.findMany({ where: { tenantId: clienteId } });
      expect(usuarios.every((u) => u.status === 'ACTIVE')).toBe(true);
    });

    it('no lo hace un admin común', async () => {
      const adminCliente = signAccessToken({ userId: 'x', tenantId: clienteId, role: 'ADMIN' });
      expect((await suspender(true, adminCliente)).status).toBe(403);
    });

    it('el dueño no puede suspender su propia empresa', async () => {
      const res = await request(app)
        .patch(`/tenants/${miTenant}/suspend`)
        .set('Authorization', `Bearer ${dueñoToken}`)
        .send({ suspended: true });
      expect(res.status).toBe(400);
    });
  });

  describe('borrar', () => {
    const borrar = (confirmName: string, token = dueñoToken) =>
      request(app).delete(`/tenants/${clienteId}`).set('Authorization', `Bearer ${token}`).send({ confirmName });

    it('pide el nombre exacto', async () => {
      // El botón está al lado de los otros, y una entidad borrada por error no se recupera.
      expect((await borrar('')).status).toBe(400);
      expect((await borrar('Baja Cliente')).status).toBe(400);
      expect(await prisma.tenant.count({ where: { id: clienteId } })).toBe(1);
    });

    it('con el nombre exacto se lleva todo', async () => {
      const empresa = await prisma.company.create({ data: { tenantId: clienteId, name: 'Su cliente', line: 'WEB' } });
      await prisma.deal.create({
        data: { tenantId: clienteId, companyId: empresa.id, title: 'Venta', amount: 100, currency: 'PEN' },
      });
      await prisma.activity.create({
        data: { tenantId: clienteId, authorId: 'x', relatedType: 'COMPANY', relatedId: empresa.id, type: 'NOTE', body: 'n', occurredAt: new Date() },
      });

      const res = await borrar('Baja Cliente SAC');
      expect(res.status).toBe(204);
      expect(await prisma.tenant.count({ where: { id: clienteId } })).toBe(0);
      // Nada huérfano: datos que ya nadie puede ver ni borrar son peores que no borrar.
      expect(await prisma.company.count({ where: { tenantId: clienteId } })).toBe(0);
      expect(await prisma.deal.count({ where: { tenantId: clienteId } })).toBe(0);
      expect(await prisma.activity.count({ where: { tenantId: clienteId } })).toBe(0);
      expect(await prisma.user.count({ where: { tenantId: clienteId } })).toBe(0);
    });

    it('queda registrado quién la borró', async () => {
      await borrar('Baja Cliente SAC');
      const log = await prisma.auditLog.findFirst({
        where: { tenantId: miTenant, entityType: 'TENANT', entityId: clienteId, action: 'DELETE' },
      });
      expect(log).toBeTruthy();
      expect(JSON.stringify(log?.before)).toContain('Baja Cliente SAC');
    });

    it('el dueño no puede borrar su propia empresa', async () => {
      const res = await request(app)
        .delete(`/tenants/${miTenant}`)
        .set('Authorization', `Bearer ${dueñoToken}`)
        .send({ confirmName: 'Baja Plataforma' });
      expect(res.status).toBe(400);
    });

    it('no lo hace un admin común', async () => {
      const adminCliente = signAccessToken({ userId: 'x', tenantId: clienteId, role: 'ADMIN' });
      expect((await borrar('Baja Cliente SAC', adminCliente)).status).toBe(403);
    });
  });
});
