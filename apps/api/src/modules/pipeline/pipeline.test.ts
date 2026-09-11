import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { signAccessToken } from '../../lib/tokens.js';

describe('etapas del pipeline', () => {
  const app = createApp();
  let tenantId: string;
  let otroTenantId: string;
  let adminToken: string;
  let sellerToken: string;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test-access-secret';
    tenantId = (await prisma.tenant.create({ data: { name: 'Pipeline Tenant' } })).id;
    otroTenantId = (await prisma.tenant.create({ data: { name: 'Pipeline Otro' } })).id;
    adminToken = signAccessToken({ userId: 'pip-admin', tenantId, role: 'ADMIN' });
    sellerToken = signAccessToken({ userId: 'pip-seller', tenantId, role: 'VENDEDOR' });
  });

  afterAll(async () => {
    for (const id of [tenantId, otroTenantId]) {
      await prisma.pipelineStage.deleteMany({ where: { tenantId: id } });
      await prisma.tenant.delete({ where: { id } });
    }
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.pipelineStage.deleteMany({ where: { tenantId } });
  });

  const get = (token = adminToken) => request(app).get('/pipeline/stages').set('Authorization', `Bearer ${token}`);
  const patch = (stage: string, body: Record<string, unknown>, token = adminToken) =>
    request(app).patch(`/pipeline/stages/${stage}`).set('Authorization', `Bearer ${token}`).send(body);

  it('una empresa que no las tocó ve las ocho de fábrica', async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(8);
    expect(res.body[0]).toMatchObject({ stage: 'CONTACTO', label: 'Contacto', enabled: true });
    expect(res.body.every((e: { enabled: boolean }) => e.enabled)).toBe(true);
  });

  it('una inmobiliaria le pone sus nombres', async () => {
    await patch('ADELANTO', { label: 'Separación' });
    await patch('ENTREGADO', { label: 'Escriturado' });
    const res = await get();
    const porEtapa = Object.fromEntries(res.body.map((e: { stage: string; label: string }) => [e.stage, e.label]));
    expect(porEtapa.ADELANTO).toBe('Separación');
    expect(porEtapa.ENTREGADO).toBe('Escriturado');
    // Renombrar no cambia lo que la etapa significa para la plata.
    const separacion = res.body.find((e: { stage: string }) => e.stage === 'ADELANTO');
    expect(separacion.meaning).toBe('ganada');
  });

  it('esconde la que no usa', async () => {
    await patch('MANTENIMIENTO', { enabled: false });
    const res = await get();
    expect(res.body.find((e: { stage: string }) => e.stage === 'MANTENIMIENTO').enabled).toBe(false);
    // Las otras siete siguen: esconder una no toca el resto.
    expect(res.body.filter((e: { enabled: boolean }) => e.enabled)).toHaveLength(7);
  });

  it('Perdido no se puede esconder', async () => {
    // Sin ella no hay dónde poner una venta que no salió, y el pipeline mostraría como abiertas
    // ventas que están muertas.
    const res = await patch('PERDIDO', { enabled: false });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Perdido');
  });

  it('no se pueden esconder TODAS las etapas de venta ganada', async () => {
    for (const etapa of ['ADELANTO', 'PRODUCCION', 'ENTREGADO']) {
      expect((await patch(etapa, { enabled: false })).status).toBe(200);
    }
    // La última que queda no se puede: el dashboard no tendría dónde contar la plata que entró.
    const ultima = await patch('MANTENIMIENTO', { enabled: false });
    expect(ultima.status).toBe(400);
  });

  it('un vendedor las ve pero no las cambia', async () => {
    expect((await get(sellerToken)).status).toBe(200);
    expect((await patch('CONTACTO', { label: 'Primer toque' }, sellerToken)).status).toBe(403);
  });

  it('los nombres son de cada empresa', async () => {
    await patch('CONTACTO', { label: 'Primer toque' });
    const otroAdmin = signAccessToken({ userId: 'otro', tenantId: otroTenantId, role: 'ADMIN' });
    const otro = await request(app).get('/pipeline/stages').set('Authorization', `Bearer ${otroAdmin}`);
    expect(otro.body[0].label).toBe('Contacto');
  });

  it('rechaza una etapa inventada', async () => {
    expect((await patch('CUALQUIERA', { label: 'x' })).status).toBe(400);
  });
});
