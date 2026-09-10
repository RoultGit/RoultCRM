import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createHash } from 'node:crypto';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';

// Espejo de la función del servicio: el test necesita el hash para poder mirar la fila del token,
// porque el valor en claro solo existe dentro del correo que nunca sale en las pruebas.
const hashToken = (token: string) =>
  createHash('sha256').update(token + process.env.JWT_REFRESH_PEPPER).digest('hex');

describe('olvidé mi contraseña', () => {
  const app = createApp();
  let tenantId: string;
  const PASSWORD = 'ContraseñaInicial123';
  const NUEVA = 'ContraseñaFlamante456';

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test-access-secret';
    process.env.JWT_REFRESH_PEPPER = process.env.JWT_REFRESH_PEPPER ?? 'test-refresh-pepper';
    tenantId = (await prisma.tenant.create({ data: { name: 'Forgot Tenant' } })).id;
  });

  afterAll(async () => {
    await prisma.passwordResetToken.deleteMany({ where: { tenantId } });
    await prisma.refreshToken.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.passwordResetToken.deleteMany({ where: { tenantId } });
    await prisma.refreshToken.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
  });

  async function makeUser(status: 'ACTIVE' | 'INACTIVE' = 'ACTIVE') {
    const email = `forgot-${Date.now()}-${Math.random().toString(36).slice(2)}@roult.pe`;
    const user = await prisma.user.create({
      data: {
        tenantId,
        email,
        passwordHash: await hashPassword(PASSWORD),
        firstName: 'Olvidadiza',
        lastName: 'Persona',
        role: 'VENDEDOR',
        status,
      },
    });
    return { ...user, email };
  }

  // Cada llamada finge venir de una IP distinta. El limitador cuenta por IP y con trust proxy
  // activo lee X-Forwarded-For, así que esto ejercita el camino real en vez de desactivar la
  // protección para poder testear — que es como se terminan filtrando agujeros a producción.
  let ip = 0;
  const from = () => `203.0.113.${(ip++ % 250) + 1}`;
  const forgot = (email: string) =>
    request(app).post('/auth/forgot-password').set('X-Forwarded-For', from()).send({ email });
  const resetWith = (body: Record<string, string>) =>
    request(app).post('/auth/reset-password').set('X-Forwarded-For', from()).send(body);

  it('answers the same whether the account exists or not', async () => {
    const user = await makeUser();
    const existe = await forgot(user.email);
    const noExiste = await forgot('nadie-tiene-este-correo@roult.pe');

    // Si la respuesta cambiara, cualquiera podría probar correos uno por uno y armar la lista de
    // quién usa el sistema — que en un CRM es la lista de clientes de la empresa.
    expect(existe.status).toBe(200);
    expect(noExiste.status).toBe(200);
    expect(existe.body).toEqual(noExiste.body);
  });

  it('creates a token only for a real, active account', async () => {
    await forgot('nadie-tiene-este-correo@roult.pe');
    expect(await prisma.passwordResetToken.count({ where: { tenantId } })).toBe(0);

    const user = await makeUser();
    await forgot(user.email);
    expect(await prisma.passwordResetToken.count({ where: { tenantId } })).toBe(1);
  });

  it('ignores a deactivated account, silently', async () => {
    const user = await makeUser('INACTIVE');
    const res = await forgot(user.email);
    // Misma respuesta, pero sin token: alguien dado de baja no puede recuperar su acceso solo.
    expect(res.status).toBe(200);
    expect(await prisma.passwordResetToken.count({ where: { tenantId } })).toBe(0);
  });

  it('never stores the token in the clear', async () => {
    const user = await makeUser();
    await forgot(user.email);
    const row = await prisma.passwordResetToken.findFirstOrThrow({ where: { tenantId } });
    // 64 caracteres hexadecimales = un sha256. El token que viaja mide 96.
    expect(row.tokenHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('kills the previous links when a new reset is requested', async () => {
    const user = await makeUser();
    await forgot(user.email);
    const primero = await prisma.passwordResetToken.findFirstOrThrow({ where: { tenantId } });
    await forgot(user.email);

    // Si el anterior siguiera vivo, cada pedido dejaría otro link usable en la bandeja de entrada.
    const after = await prisma.passwordResetToken.findUniqueOrThrow({ where: { id: primero.id } });
    expect(after.usedAt).not.toBeNull();
    expect(await prisma.passwordResetToken.count({ where: { tenantId, usedAt: null } })).toBe(1);
  });

  describe('usar el link', () => {
    // El token en claro no se puede leer de la base. Se genera uno propio y se planta su hash, que
    // es exactamente lo que hace el servicio.
    async function plantToken(userId: string, overrides: Partial<{ expiresAt: Date; usedAt: Date }> = {}) {
      const token = 'a'.repeat(96);
      await prisma.passwordResetToken.create({
        data: {
          tenantId,
          userId,
          tokenHash: hashToken(token),
          expiresAt: overrides.expiresAt ?? new Date(Date.now() + 3_600_000),
          usedAt: overrides.usedAt ?? null,
        },
      });
      return token;
    }

    it('changes the password and lets the user in with the new one', async () => {
      const user = await makeUser();
      const token = await plantToken(user.id);

      const res = await resetWith({ token, newPassword: NUEVA });
      expect(res.status).toBe(200);

      const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(await verifyPassword(NUEVA, after.passwordHash)).toBe(true);
      expect(
        (await request(app).post('/auth/login').send({ email: user.email, password: NUEVA })).status
      ).toBe(200);
    });

    it('closes every session: recovering an account has to kick out whoever took it', async () => {
      const user = await makeUser();
      const intruso = await request(app).post('/auth/login').send({ email: user.email, password: PASSWORD });
      const token = await plantToken(user.id);

      await resetWith({ token, newPassword: NUEVA });

      const cookie = (intruso.headers['set-cookie'] as unknown as string[])[0];
      expect((await request(app).post('/auth/refresh').set('Cookie', cookie)).status).toBe(401);
    });

    it('works exactly once', async () => {
      const user = await makeUser();
      const token = await plantToken(user.id);

      expect((await resetWith({ token, newPassword: NUEVA })).status).toBe(200);
      // El link que quedó en la bandeja de entrada no puede servir para siempre.
      const second = await resetWith({ token, newPassword: 'OtraDistinta789' });
      expect(second.status).toBe(401);
      const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(await verifyPassword(NUEVA, after.passwordHash)).toBe(true);
    });

    it('refuses an expired link', async () => {
      const user = await makeUser();
      const token = await plantToken(user.id, { expiresAt: new Date(Date.now() - 1000) });
      expect((await resetWith({ token, newPassword: NUEVA })).status).toBe(401);
    });

    it('refuses an invented token', async () => {
      await makeUser();
      const res = await resetWith({ token: 'b'.repeat(96), newPassword: NUEVA });
      expect(res.status).toBe(401);
    });

    it('still demands a long enough password', async () => {
      const user = await makeUser();
      const token = await plantToken(user.id);
      const res = await resetWith({ token, newPassword: 'corta' });
      expect(res.status).toBe(400);
      // Y el token no se gasta con un intento inválido: el usuario puede reintentar con el mismo link.
      const row = await prisma.passwordResetToken.findFirstOrThrow({ where: { tenantId } });
      expect(row.usedAt).toBeNull();
    });

    it('clears the temporary-password flag', async () => {
      const user = await makeUser();
      await prisma.user.update({ where: { id: user.id }, data: { mustChangePassword: true } });
      const token = await plantToken(user.id);

      await resetWith({ token, newPassword: NUEVA });
      const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      // Acaba de elegir una propia: seguir pidiéndosela al entrar sería un bucle.
      expect(after.mustChangePassword).toBe(false);
    });
  });
});
