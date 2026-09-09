import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';

describe('gestión de contraseñas', () => {
  const app = createApp();
  let tenantId: string;
  const PASSWORD = 'ContraseñaInicial123';

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test-access-secret';
    process.env.JWT_REFRESH_PEPPER = process.env.JWT_REFRESH_PEPPER ?? 'test-refresh-pepper';
    tenantId = (await prisma.tenant.create({ data: { name: 'Password Tenant' } })).id;
  });

  afterAll(async () => {
    await prisma.refreshToken.deleteMany({ where: { tenantId } });
    await prisma.auditLog.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.refreshToken.deleteMany({ where: { tenantId } });
    await prisma.auditLog.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
  });

  async function makeUser(role: 'ADMIN' | 'VENDEDOR' = 'VENDEDOR') {
    const email = `pw-${role}-${Date.now()}-${Math.random().toString(36).slice(2)}@roult.pe`;
    const user = await prisma.user.create({
      data: {
        tenantId,
        email,
        passwordHash: await hashPassword(PASSWORD),
        firstName: 'Persona',
        lastName: role,
        role,
      },
    });
    return { ...user, email };
  }

  const login = (email: string, password: string) =>
    request(app).post('/auth/login').send({ email, password });

  describe('cambio propio', () => {
    it('changes the password and lets the user in with the new one', async () => {
      const user = await makeUser();
      const session = await login(user.email, PASSWORD);

      const res = await request(app)
        .patch('/auth/password')
        .set('Authorization', `Bearer ${session.body.accessToken}`)
        .send({ currentPassword: PASSWORD, newPassword: 'NuevaContraseña456' });
      expect(res.status).toBe(200);
      // Devuelve un token nuevo: como se cortan TODAS las sesiones, sin esto el que acaba de
      // cambiar su contraseña quedaría afuera de la app por haberse protegido.
      expect(res.body.accessToken).toBeTruthy();

      expect((await login(user.email, 'NuevaContraseña456')).status).toBe(200);
      expect((await login(user.email, PASSWORD)).status).toBe(401);
    });

    it('kills every open session, which is the point of changing a password', async () => {
      const user = await makeUser();
      // Dos sesiones, como una laptop y un teléfono. O como el dueño y quien le robó la sesión.
      const robada = await login(user.email, PASSWORD);
      const propia = await login(user.email, PASSWORD);

      await request(app)
        .patch('/auth/password')
        .set('Authorization', `Bearer ${propia.body.accessToken}`)
        .send({ currentPassword: PASSWORD, newPassword: 'NuevaContraseña456' });

      // El refresh de la sesión ajena tiene que estar muerto. Si sobreviviera, cambiar la
      // contraseña no echaría a nadie y la víctima creería que se protegió.
      const cookie = (robada.headers['set-cookie'] as unknown as string[])[0];
      const res = await request(app).post('/auth/refresh').set('Cookie', cookie);
      expect(res.status).toBe(401);
    });

    it('demands the current password: a stolen session must not lock the owner out', async () => {
      const user = await makeUser();
      const session = await login(user.email, PASSWORD);

      const res = await request(app)
        .patch('/auth/password')
        .set('Authorization', `Bearer ${session.body.accessToken}`)
        .send({ currentPassword: 'la-que-no-es', newPassword: 'NuevaContraseña456' });
      expect(res.status).toBe(401);
      expect((await login(user.email, PASSWORD)).status).toBe(200);
    });

    it('refuses a short password or one equal to the current', async () => {
      const user = await makeUser();
      const session = await login(user.email, PASSWORD);
      const change = (body: Record<string, string>) =>
        request(app)
          .patch('/auth/password')
          .set('Authorization', `Bearer ${session.body.accessToken}`)
          .send(body);

      expect((await change({ currentPassword: PASSWORD, newPassword: 'corta' })).status).toBe(400);
      expect((await change({ currentPassword: PASSWORD, newPassword: PASSWORD })).status).toBe(400);
    });

    it('rejects an unauthenticated attempt', async () => {
      const res = await request(app)
        .patch('/auth/password')
        .send({ currentPassword: PASSWORD, newPassword: 'NuevaContraseña456' });
      expect(res.status).toBe(401);
    });
  });

  describe('reseteo por un admin', () => {
    it('hands back a working temporary password and forces its change', async () => {
      const admin = await makeUser('ADMIN');
      const target = await makeUser();
      const session = await login(admin.email, PASSWORD);

      const res = await request(app)
        .post(`/users/${target.id}/password/reset`)
        .set('Authorization', `Bearer ${session.body.accessToken}`);
      expect(res.status).toBe(200);
      expect(res.body.temporaryPassword).toHaveLength(16);

      const after = await prisma.user.findUnique({ where: { id: target.id } });
      expect(await verifyPassword(res.body.temporaryPassword, after!.passwordHash)).toBe(true);
      // La provisoria que se pasa por WhatsApp no puede quedar viva para siempre.
      expect(after!.mustChangePassword).toBe(true);
      expect((await login(target.email, res.body.temporaryPassword)).status).toBe(200);
    });

    it('closes the sessions of whoever got reset', async () => {
      const admin = await makeUser('ADMIN');
      const target = await makeUser();
      const victima = await login(target.email, PASSWORD);
      const session = await login(admin.email, PASSWORD);

      await request(app)
        .post(`/users/${target.id}/password/reset`)
        .set('Authorization', `Bearer ${session.body.accessToken}`);

      // El caso real: alguien perdió el teléfono o se fue de la empresa. Resetear sin cerrar sus
      // sesiones lo deja adentro igual.
      const cookie = (victima.headers['set-cookie'] as unknown as string[])[0];
      expect((await request(app).post('/auth/refresh').set('Cookie', cookie)).status).toBe(401);
    });

    it('does not let a VENDEDOR reset anyone', async () => {
      const seller = await makeUser();
      const target = await makeUser();
      const session = await login(seller.email, PASSWORD);

      const res = await request(app)
        .post(`/users/${target.id}/password/reset`)
        .set('Authorization', `Bearer ${session.body.accessToken}`);
      expect(res.status).toBe(403);
      expect((await login(target.email, PASSWORD)).status).toBe(200);
    });

    it('does not let an admin reset someone from another entity', async () => {
      const admin = await makeUser('ADMIN');
      const otherTenant = await prisma.tenant.create({ data: { name: 'Otra empresa pw' } });
      const stranger = await prisma.user.create({
        data: {
          tenantId: otherTenant.id,
          email: `ajeno-${Date.now()}@otra.pe`,
          passwordHash: await hashPassword(PASSWORD),
          firstName: 'Ajeno',
          lastName: 'Total',
          role: 'ADMIN',
        },
      });
      const session = await login(admin.email, PASSWORD);

      const res = await request(app)
        .post(`/users/${stranger.id}/password/reset`)
        .set('Authorization', `Bearer ${session.body.accessToken}`);
      expect(res.status).toBe(404);
      // Y sigue pudiendo entrar con la suya: nadie de afuera le tocó el acceso.
      expect((await login(stranger.email, PASSWORD)).status).toBe(200);

      // El login de arriba le dejó un refresh token, que tiene FK contra el usuario: hay que
      // borrarlo antes o el delete revienta.
      await prisma.refreshToken.deleteMany({ where: { userId: stranger.id } });
      await prisma.user.delete({ where: { id: stranger.id } });
      await prisma.tenant.delete({ where: { id: otherTenant.id } });
    });

    it('never writes the password into the audit log', async () => {
      const admin = await makeUser('ADMIN');
      const target = await makeUser();
      const session = await login(admin.email, PASSWORD);

      const res = await request(app)
        .post(`/users/${target.id}/password/reset`)
        .set('Authorization', `Bearer ${session.body.accessToken}`);

      const log = await prisma.auditLog.findFirst({ where: { tenantId, entityId: target.id } });
      // Lo que hay que registrar es que alguien reseteó el acceso de otro, nunca cuál fue el valor.
      expect(JSON.stringify(log?.after)).not.toContain(res.body.temporaryPassword);
    });
  });
});
