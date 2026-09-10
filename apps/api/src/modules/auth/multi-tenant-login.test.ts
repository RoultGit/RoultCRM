import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { hashPassword } from '../../lib/password.js';
import { verifyAccessToken } from '../../lib/tokens.js';

/**
 * La misma persona en más de una empresa.
 *
 * Es el caso que el correo único global impedía: un contador que atiende a dos clientes, o el dueño
 * con dos negocios. Ahora el correo es único POR EMPRESA, así que el login tiene que resolver a cuál
 * de ellas entra.
 */
describe('ingreso con un correo en varias empresas', () => {
  const app = createApp();
  const sello = Date.now();
  const CORREO = `contadora-${sello}@estudio.pe`;
  const CLAVE_A = 'ClaveDeLaEmpresaA26';
  const CLAVE_B = 'ClaveDeLaEmpresaB26';
  let tenantA: string;
  let tenantB: string;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test-access-secret';
    process.env.JWT_REFRESH_PEPPER = process.env.JWT_REFRESH_PEPPER ?? 'test-refresh-pepper';
    tenantA = (await prisma.tenant.create({ data: { name: `Ferretería ${sello}` } })).id;
    tenantB = (await prisma.tenant.create({ data: { name: `Panadería ${sello}` } })).id;
  });

  afterAll(async () => {
    for (const id of [tenantA, tenantB]) {
      await prisma.refreshToken.deleteMany({ where: { tenantId: id } });
      await prisma.passwordResetToken.deleteMany({ where: { tenantId: id } });
      await prisma.user.deleteMany({ where: { tenantId: id } });
      await prisma.tenant.delete({ where: { id } });
    }
    await prisma.$disconnect();
  });

  const crear = async (tenantId: string, password: string, role: 'ADMIN' | 'VENDEDOR' = 'ADMIN') =>
    prisma.user.create({
      data: {
        tenantId,
        email: CORREO,
        passwordHash: await hashPassword(password),
        firstName: 'Nora',
        lastName: 'Contadora',
        role,
      },
    });

  const login = (body: Record<string, string>) => request(app).post('/auth/login').send(body);

  it('lets the same email exist in two different entities', async () => {
    // Justo lo que el índice único global impedía.
    await crear(tenantA, CLAVE_A);
    await crear(tenantB, CLAVE_B);
    expect(await prisma.user.count({ where: { email: CORREO } })).toBe(2);
  });

  it('picks the entity by the password, without asking', async () => {
    const a = await login({ email: CORREO, password: CLAVE_A });
    expect(a.status).toBe(200);
    expect(a.body.accessToken).toBeTruthy();
    // La contraseña es la que decide: con la de la ferretería entra a la ferretería.
    expect(verifyAccessToken(a.body.accessToken).tenantId).toBe(tenantA);

    const b = await login({ email: CORREO, password: CLAVE_B });
    expect(verifyAccessToken(b.body.accessToken).tenantId).toBe(tenantB);
  });

  it('still rejects a wrong password', async () => {
    expect((await login({ email: CORREO, password: 'ningunaDeLasDos' })).status).toBe(401);
  });

  it('asks which entity only when the same password works in both', async () => {
    const compartida = `duena-${sello}@negocios.pe`;
    const MISMA = 'LaMismaEnLasDos2026';
    for (const tenantId of [tenantA, tenantB]) {
      await prisma.user.create({
        data: {
          tenantId,
          email: compartida,
          passwordHash: await hashPassword(MISMA),
          firstName: 'Dueña',
          lastName: 'Deambas',
          role: 'ADMIN',
        },
      });
    }

    const res = await login({ email: compartida, password: MISMA });
    // 200 y no un error: elegir empresa es un paso del ingreso, no una falla.
    expect(res.status).toBe(200);
    expect(res.body.needsTenantChoice).toBe(true);
    expect(res.body.tenants).toHaveLength(2);
    expect(res.body.accessToken).toBeUndefined();
    expect(res.body.tenants.map((t: { name: string }) => t.name).sort()).toEqual(
      [`Ferretería ${sello}`, `Panadería ${sello}`].sort()
    );

    // Y con la empresa elegida, entra.
    const elegida = await login({ email: compartida, password: MISMA, tenantId: tenantB });
    expect(elegida.status).toBe(200);
    expect(verifyAccessToken(elegida.body.accessToken).tenantId).toBe(tenantB);
  });

  it('never reveals the entities before the password is right', async () => {
    const res = await login({ email: CORREO, password: 'estaNoEsLaClave' });
    // Devolver la lista antes de validar sería contarle a cualquiera en qué empresas está
    // registrado un correo.
    expect(res.status).toBe(401);
    expect(JSON.stringify(res.body)).not.toContain('Ferretería');
    expect(JSON.stringify(res.body)).not.toContain('Panadería');
  });

  it('refuses an entity where that password does not work', async () => {
    // La clave de la ferretería no sirve para entrar a la panadería aunque el correo exista en las dos.
    const res = await login({ email: CORREO, password: CLAVE_A, tenantId: tenantB });
    expect(res.status).toBe(401);
  });

  it('still refuses a repeated email inside the same entity', async () => {
    // Único por empresa sigue siendo único: dos cuentas iguales adentro de la misma empresa serían
    // ambiguas para siempre.
    await expect(crear(tenantA, 'OtraClaveCualquiera1')).rejects.toThrow();
  });

  it('sends one recovery link per account, because there is no way to know which one they forgot', async () => {
    await prisma.passwordResetToken.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
    const res = await request(app)
      .post('/auth/forgot-password')
      .set('X-Forwarded-For', `198.51.100.${(sello % 200) + 1}`)
      .send({ email: CORREO });
    expect(res.status).toBe(200);

    const tokens = await prisma.passwordResetToken.findMany({
      where: { tenantId: { in: [tenantA, tenantB] } },
    });
    expect(tokens).toHaveLength(2);
    expect(new Set(tokens.map((t) => t.tenantId))).toEqual(new Set([tenantA, tenantB]));
  });
});
