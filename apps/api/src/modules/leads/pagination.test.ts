import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { signAccessToken } from '../../lib/tokens.js';
import { MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE } from '@roult/shared';

/**
 * Sin tope, una sola petición devuelve la tabla entera de un cliente con años de historia: son
 * megabytes por carga de pantalla y el teléfono de un vendedor en la calle no los baja.
 */
describe('paginación de las listas', () => {
  const app = createApp();
  let tenantId: string;
  let token: string;
  let companyId: string;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test-access-secret';
    tenantId = (await prisma.tenant.create({ data: { name: 'Paginación Tenant' } })).id;
    token = signAccessToken({ userId: 'pag-admin', tenantId, role: 'ADMIN' });
    companyId = (await prisma.company.create({ data: { tenantId, name: 'Cliente', line: 'WEB' } })).id;

    await prisma.lead.createMany({
      data: Array.from({ length: 120 }, (_, i) => ({
        tenantId,
        businessName: `Lead ${String(i).padStart(3, '0')}`,
        contactName: 'x',
        line: 'WEB' as const,
      })),
    });
    await prisma.task.createMany({
      data: Array.from({ length: 60 }, (_, i) => ({
        tenantId,
        title: `Tarea ${i}`,
        ownerId: 'pag-admin',
        dueDate: new Date('2026-10-01'),
      })),
    });
  });

  afterAll(async () => {
    await prisma.task.deleteMany({ where: { tenantId } });
    await prisma.lead.deleteMany({ where: { tenantId } });
    await prisma.company.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  const get = (path: string) => request(app).get(path).set('Authorization', `Bearer ${token}`);

  it('sin pedir nada, devuelve una página y no las 120', async () => {
    const res = await get('/leads');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(DEFAULT_PAGE_SIZE);
  });

  it('dice cuántas hay en total, para poder mostrar "50 de 120"', async () => {
    const res = await get('/leads');
    expect(res.headers['x-total-count']).toBe('120');
    // Sin exponerla, el navegador no puede leer la cabecera en una respuesta con CORS.
    expect(res.headers['access-control-expose-headers']).toContain('X-Total-Count');
  });

  it('trae la página que se le pide', async () => {
    const primera = await get('/leads?limit=10&offset=0');
    const segunda = await get('/leads?limit=10&offset=10');
    expect(primera.body).toHaveLength(10);
    expect(segunda.body).toHaveLength(10);
    // Páginas distintas: si el offset se ignorara, las dos traerían lo mismo.
    expect(segunda.body[0].id).not.toBe(primera.body[0].id);
  });

  it('la última página trae el resto y no falla', async () => {
    const res = await get('/leads?limit=50&offset=100');
    expect(res.body).toHaveLength(20);
  });

  it('no se puede pedir más que el tope, aunque se insista', async () => {
    // El tope es la defensa real: sin él, `?limit=999999` vuelve a traer la tabla entera.
    const res = await get(`/leads?limit=${MAX_PAGE_SIZE + 500}`);
    expect(res.status).toBe(400);
  });

  it('rechaza una paginación imposible en vez de adivinar', async () => {
    expect((await get('/leads?limit=0')).status).toBe(400);
    expect((await get('/leads?offset=-5')).status).toBe(400);
  });

  it('el total respeta el filtro, no cuenta toda la tabla', async () => {
    await prisma.lead.updateMany({ where: { tenantId, businessName: 'Lead 000' }, data: { status: 'CONTACTED' } });
    const res = await get('/leads?status=CONTACTED');
    // Si el conteo usara un `where` distinto al de la página, acá diría 120.
    expect(res.headers['x-total-count']).toBe('1');
    expect(res.body).toHaveLength(1);
  });

  it('las demás listas también paginan', async () => {
    for (const ruta of ['/tasks', '/companies', '/contacts', '/deals', '/quotes', '/installments']) {
      const res = await get(`${ruta}?limit=5`);
      expect(res.status, ruta).toBe(200);
      expect(res.body.length, ruta).toBeLessThanOrEqual(5);
      expect(res.headers['x-total-count'], ruta).toBeDefined();
    }
  });

  it('las tareas paginadas siguen respetando el alcance del vendedor', async () => {
    const vendedor = signAccessToken({ userId: 'otro-pag', tenantId, role: 'VENDEDOR' });
    const res = await request(app).get('/tasks?limit=100').set('Authorization', `Bearer ${vendedor}`);
    // Las tareas se filtran por ownerId. Con el filtro equivocado, este vendedor vería las 60.
    expect(res.body).toHaveLength(0);
    expect(res.headers['x-total-count']).toBe('0');
  });
});
