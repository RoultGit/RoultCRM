import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { signAccessToken } from '../../lib/tokens.js';
import { verifyPassword } from '../../lib/password.js';

describe('/tenants routes', () => {
  const app = createApp();
  let tenantId: string;
  let ownerToken: string;
  let adminToken: string;
  let sellerToken: string;
  const created: string[] = [];

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test-access-secret';
    tenantId = (await prisma.tenant.create({ data: { name: 'Plataforma Tenant' } })).id;
    ownerToken = signAccessToken({ userId: 'owner-1', tenantId, role: 'ADMIN', isPlatformOwner: true });
    adminToken = signAccessToken({ userId: 'admin-1', tenantId, role: 'ADMIN' });
    sellerToken = signAccessToken({ userId: 'seller-1', tenantId, role: 'VENDEDOR' });
  });

  afterAll(async () => {
    for (const id of created) {
      await prisma.user.deleteMany({ where: { tenantId: id } });
      await prisma.tenant.deleteMany({ where: { id } });
    }
    await prisma.auditLog.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  const newTenant = (overrides: Record<string, string> = {}) => ({
    name: `Cliente ${Date.now()}${Math.random()}`,
    adminEmail: `admin-${Date.now()}-${Math.random().toString(36).slice(2)}@cliente.pe`,
    adminFirstName: 'Primer',
    adminLastName: 'Admin',
    ...overrides,
  });

  it('rejects unauthenticated requests', async () => {
    expect((await request(app).get('/tenants')).status).toBe(401);
    expect((await request(app).post('/tenants').send(newTenant())).status).toBe(401);
  });

  it('does not let a tenant ADMIN create or list entities', async () => {
    // Esta es LA regla del endpoint. El admin de una empresa cliente no puede dar de alta otras
    // empresas ni siquiera enterarse de que existen: sería ver la cartera de clientes del negocio.
    expect((await request(app).get('/tenants').set('Authorization', `Bearer ${adminToken}`)).status).toBe(403);
    const res = await request(app)
      .post('/tenants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(newTenant());
    expect(res.status).toBe(403);
    expect(await prisma.tenant.count({ where: { name: { startsWith: 'Cliente ' } } })).toBe(0);
  });

  it('does not let a VENDEDOR near it either', async () => {
    expect((await request(app).get('/tenants').set('Authorization', `Bearer ${sellerToken}`)).status).toBe(403);
  });

  it('creates the entity with its first admin and a usable password', async () => {
    const payload = newTenant();
    const res = await request(app).post('/tenants').set('Authorization', `Bearer ${ownerToken}`).send(payload);
    expect(res.status).toBe(201);
    created.push(res.body.tenant.id);

    expect(res.body.tenant.name).toBe(payload.name);
    expect(res.body.tenant.userCount).toBe(1);
    expect(res.body.adminEmail).toBe(payload.adminEmail);
    expect(res.body.temporaryPassword).toHaveLength(16);

    const user = await prisma.user.findUnique({ where: { email: payload.adminEmail } });
    expect(user?.role).toBe('ADMIN');
    expect(user?.tenantId).toBe(res.body.tenant.id);
    // La contraseña devuelta tiene que servir de verdad para entrar; si no, la entidad nace muerta.
    expect(await verifyPassword(res.body.temporaryPassword, user!.passwordHash)).toBe(true);
  });

  it('never makes the new admin a platform owner', async () => {
    const res = await request(app).post('/tenants').set('Authorization', `Bearer ${ownerToken}`).send(newTenant());
    created.push(res.body.tenant.id);
    const user = await prisma.user.findUnique({ where: { email: res.body.adminEmail } });
    // Si el admin recién creado naciera como dueño de plataforma, el primer cliente podría crear
    // entidades y listar las de todos los demás: escalada de privilegios en el alta misma.
    expect(user?.isPlatformOwner).toBe(false);
  });

  it('refuses an email that already belongs to another entity', async () => {
    const first = await request(app).post('/tenants').set('Authorization', `Bearer ${ownerToken}`).send(newTenant());
    created.push(first.body.tenant.id);

    const clash = await request(app)
      .post('/tenants')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send(newTenant({ adminEmail: first.body.adminEmail }));
    expect(clash.status).toBe(409);
    expect(clash.body.error).toContain('ya está en uso');
  });

  it('does not leave a half-created entity when the admin cannot be created', async () => {
    const before = await prisma.tenant.count();
    await request(app)
      .post('/tenants')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send(newTenant({ adminEmail: 'no-es-un-correo' }));
    // Una entidad sin admin nace inaccesible: nadie podría entrar a arreglarla.
    expect(await prisma.tenant.count()).toBe(before);
  });

  it('lists every entity for the platform owner', async () => {
    const res = await request(app).get('/tenants').set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toHaveProperty('userCount');
  });
});
