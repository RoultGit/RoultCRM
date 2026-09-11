import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { signAccessToken } from '../../lib/tokens.js';

describe('descargar todos mis datos', () => {
  const app = createApp();
  let tenantId: string;
  let otroTenantId: string;
  let adminToken: string;
  let sellerToken: string;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test-access-secret';
    tenantId = (await prisma.tenant.create({ data: { name: 'Export Tenant' } })).id;
    otroTenantId = (await prisma.tenant.create({ data: { name: 'Export Otro' } })).id;
    adminToken = signAccessToken({ userId: 'exp-admin', tenantId, role: 'ADMIN' });
    sellerToken = signAccessToken({ userId: 'exp-seller', tenantId, role: 'VENDEDOR' });

    await prisma.user.create({
      data: { tenantId, email: `exp-${Date.now()}@roult.pe`, passwordHash: 'HASH-SECRETO', firstName: 'E', lastName: 'X', role: 'ADMIN' },
    });
    const empresa = await prisma.company.create({ data: { tenantId, name: 'Mi cliente', line: 'WEB' } });
    await prisma.deal.create({ data: { tenantId, companyId: empresa.id, title: 'Mi venta', amount: 100, currency: 'PEN' } });

    const ajena = await prisma.company.create({ data: { tenantId: otroTenantId, name: 'Cliente de otro', line: 'WEB' } });
    await prisma.deal.create({ data: { tenantId: otroTenantId, companyId: ajena.id, title: 'Venta ajena', amount: 999, currency: 'PEN' } });
  });

  afterAll(async () => {
    for (const id of [tenantId, otroTenantId]) {
      await prisma.deal.deleteMany({ where: { tenantId: id } });
      await prisma.company.deleteMany({ where: { tenantId: id } });
      await prisma.user.deleteMany({ where: { tenantId: id } });
      await prisma.tenant.delete({ where: { id } });
    }
    await prisma.$disconnect();
  });

  const exportar = (token: string) => request(app).get('/export').set('Authorization', `Bearer ${token}`);

  it('trae todo lo de la empresa, con nombres entendibles', async () => {
    const res = await exportar(adminToken);
    expect(res.status).toBe(200);
    expect(res.body.empresa.name).toBe('Export Tenant');
    expect(res.body.clientes).toHaveLength(1);
    expect(res.body.ventas[0].title).toBe('Mi venta');
    // El archivo tiene que entenderse sin documentación.
    expect(Object.keys(res.body)).toEqual(expect.arrayContaining(['equipo', 'contactos', 'cotizaciones', 'cuotasDeCobranza']));
  });

  it('se descarga como archivo, no se muestra en pantalla', async () => {
    const res = await exportar(adminToken);
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.headers['content-disposition']).toContain('.json');
  });

  it('NUNCA incluye contraseñas', async () => {
    const res = await exportar(adminToken);
    const texto = JSON.stringify(res.body);
    // Eso no son "sus datos": son las llaves del sistema, y un archivo que circula por correo no
    // es lugar para ellas.
    expect(texto).not.toContain('HASH-SECRETO');
    expect(texto).not.toContain('passwordHash');
  });

  it('no se lleva NADA de otra empresa', async () => {
    const res = await exportar(adminToken);
    const texto = JSON.stringify(res.body);
    expect(texto).not.toContain('Cliente de otro');
    expect(texto).not.toContain('Venta ajena');
    expect(texto).not.toContain(otroTenantId);
  });

  it('el alcance sale del token y no de la URL', async () => {
    // No hay forma de pedir "exportame la empresa X": no recibe ningún id.
    const otroAdmin = signAccessToken({ userId: 'otro', tenantId: otroTenantId, role: 'ADMIN' });
    const res = await exportar(otroAdmin);
    expect(res.body.empresa.name).toBe('Export Otro');
  });

  it('un vendedor no exporta la empresa entera', async () => {
    expect((await exportar(sellerToken)).status).toBe(403);
  });

  it('pide sesión', async () => {
    expect((await request(app).get('/export')).status).toBe(401);
  });
});
