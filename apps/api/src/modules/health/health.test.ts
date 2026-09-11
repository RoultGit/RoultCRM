import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { signAccessToken } from '../../lib/tokens.js';
import { recordError, pruneErrors } from '../../lib/errorLog.js';

describe('registro de errores del servidor', () => {
  const app = createApp();
  let tenantId: string;
  let dueñoToken: string;
  let adminToken: string;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test-access-secret';
    tenantId = (await prisma.tenant.create({ data: { name: 'Errores Tenant' } })).id;
    dueñoToken = signAccessToken({ userId: 'dueño', tenantId, role: 'ADMIN', isPlatformOwner: true });
    adminToken = signAccessToken({ userId: 'admin', tenantId, role: 'ADMIN' });
  });

  afterAll(async () => {
    await prisma.errorLog.deleteMany({});
    await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.errorLog.deleteMany({});
  });

  const falso = (status: number, mensaje = 'algo explotó') =>
    recordError(
      { method: 'GET', path: '/deals', user: { tenantId, userId: 'u1' } } as never,
      status,
      new Error(mensaje)
    );

  it('guarda los 500, que son culpa nuestra', async () => {
    await falso(500);
    const filas = await prisma.errorLog.findMany({});
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ status: 500, method: 'GET', path: '/deals', tenantId });
    expect(filas[0].stack).toContain('Error');
  });

  it('NO guarda los 4xx', async () => {
    // Un 400 o un 404 son respuestas correctas del sistema: llenarían el registro de ruido que
    // tapa lo que sí importa.
    await falso(404);
    await falso(400);
    expect(await prisma.errorLog.count()).toBe(0);
  });

  it('nunca rompe la respuesta aunque falle el registro', async () => {
    // Sin objeto de request válido: lo último que puede hacer es tirar encima del error que ya hubo.
    await expect(recordError(undefined as never, 500, new Error('x'))).resolves.toBeUndefined();
  });

  it('lo ve el dueño de la plataforma', async () => {
    await falso(500, 'para el dueño');
    const res = await request(app).get('/system/errors').set('Authorization', `Bearer ${dueñoToken}`);
    expect(res.status).toBe(200);
    expect(res.body[0].message).toBe('para el dueño');
  });

  it('NO lo ve el admin de una empresa cliente', async () => {
    // Adentro hay rutas, mensajes y trazas de TODAS las empresas.
    expect((await request(app).get('/system/errors').set('Authorization', `Bearer ${adminToken}`)).status).toBe(403);
  });

  it('pide sesión', async () => {
    expect((await request(app).get('/system/errors')).status).toBe(401);
  });

  it('los viejos se borran', async () => {
    await falso(500);
    await prisma.errorLog.updateMany({ data: { createdAt: new Date('2020-01-01') } });
    await falso(500, 'reciente');
    const borrados = await pruneErrors(30);
    expect(borrados).toBe(1);
    const quedan = await prisma.errorLog.findMany({});
    expect(quedan).toHaveLength(1);
    expect(quedan[0].message).toBe('reciente');
  });
});
