import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { signAccessToken } from '../../lib/tokens.js';

describe('/custom-fields', () => {
  const app = createApp();
  let tenantId: string;
  let adminToken: string;
  let sellerToken: string;
  let sellerId: string;
  let miCompanyId: string;
  let ajenaCompanyId: string;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test-access-secret';
    tenantId = (await prisma.tenant.create({ data: { name: 'Campos Tenant' } })).id;
    adminToken = signAccessToken({ userId: 'admin-1', tenantId, role: 'ADMIN' });
    sellerId = (
      await prisma.user.create({
        data: {
          tenantId,
          email: `campos-${Date.now()}@roult.pe`,
          passwordHash: 'x',
          firstName: 'Campo',
          lastName: 'Seller',
          role: 'VENDEDOR',
        },
      })
    ).id;
    sellerToken = signAccessToken({ userId: sellerId, tenantId, role: 'VENDEDOR' });
  });

  afterAll(async () => {
    await prisma.customFieldValue.deleteMany({ where: { tenantId } });
    await prisma.customField.deleteMany({ where: { tenantId } });
    await prisma.company.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.customFieldValue.deleteMany({ where: { tenantId } });
    await prisma.customField.deleteMany({ where: { tenantId } });
    await prisma.company.deleteMany({ where: { tenantId } });
    miCompanyId = (
      await prisma.company.create({ data: { tenantId, name: 'Del vendedor', line: 'WEB', assignedUserId: sellerId } })
    ).id;
    ajenaCompanyId = (
      await prisma.company.create({ data: { tenantId, name: 'Del admin', line: 'WEB', assignedUserId: 'admin-1' } })
    ).id;
  });

  const crear = (body: Record<string, unknown>, token = adminToken) =>
    request(app).post('/custom-fields').set('Authorization', `Bearer ${token}`).send(body);
  const guardar = (body: Record<string, unknown>, token = sellerToken) =>
    request(app).put('/custom-fields/values').set('Authorization', `Bearer ${token}`).send(body);
  const leer = (recordId: string, token = sellerToken) =>
    request(app)
      .get(`/custom-fields/values?entity=COMPANY&recordId=${recordId}`)
      .set('Authorization', `Bearer ${token}`);

  const texto = { entity: 'COMPANY', label: 'RUC', type: 'TEXT' };

  describe('definir campos', () => {
    it('rejects unauthenticated requests', async () => {
      expect((await request(app).get('/custom-fields')).status).toBe(401);
    });

    it('does not let a VENDEDOR define fields', async () => {
      // Definir campos cambia el formulario de toda la empresa: no es del vendedor.
      expect((await crear(texto, sellerToken)).status).toBe(403);
    });

    it('lets a VENDEDOR read them: they have to know what to fill in', async () => {
      await crear(texto);
      const res = await request(app).get('/custom-fields').set('Authorization', `Bearer ${sellerToken}`);
      expect(res.status).toBe(200);
      expect(res.body[0].label).toBe('RUC');
    });

    it('refuses a list with no options', async () => {
      // Un desplegable vacío no deja elegir nada: el campo queda inservible sin que nada avise.
      const res = await crear({ entity: 'COMPANY', label: 'Rubro', type: 'SELECT', options: [] });
      expect(res.status).toBe(400);
    });

    it('orders new fields at the end', async () => {
      await crear(texto);
      const segundo = await crear({ entity: 'COMPANY', label: 'Cupo', type: 'NUMBER' });
      expect(segundo.body.position).toBe(1);
    });

    it('keeps each entity separate', async () => {
      await crear(texto);
      await crear({ entity: 'DEAL', label: 'N° de orden', type: 'TEXT' });
      const empresas = await request(app).get('/custom-fields?entity=COMPANY').set('Authorization', `Bearer ${adminToken}`);
      expect(empresas.body).toHaveLength(1);
      expect(empresas.body[0].label).toBe('RUC');
    });
  });

  describe('validar el valor contra el tipo', () => {
    it('refuses text in a number field', async () => {
      const campo = (await crear({ entity: 'COMPANY', label: 'Cupo', type: 'NUMBER' })).body;
      // El valor se guarda como texto, así que esta es la ÚNICA barrera: sin ella, cualquier cuenta
      // que use el campo da NaN.
      const malo = await guardar({ entity: 'COMPANY', recordId: miCompanyId, values: { [campo.id]: 'más o menos 30' } });
      expect(malo.status).toBe(400);
      const bueno = await guardar({ entity: 'COMPANY', recordId: miCompanyId, values: { [campo.id]: '30.5' } });
      expect(bueno.status).toBe(200);
    });

    it('refuses an option that is not in the list', async () => {
      const campo = (await crear({ entity: 'COMPANY', label: 'Rubro', type: 'SELECT', options: ['Retail', 'Industria'] })).body;
      expect((await guardar({ entity: 'COMPANY', recordId: miCompanyId, values: { [campo.id]: 'Inventado' } })).status).toBe(400);
      expect((await guardar({ entity: 'COMPANY', recordId: miCompanyId, values: { [campo.id]: 'Retail' } })).status).toBe(200);
    });

    it('refuses a date that is not a date', async () => {
      const campo = (await crear({ entity: 'COMPANY', label: 'Vence', type: 'DATE' })).body;
      expect((await guardar({ entity: 'COMPANY', recordId: miCompanyId, values: { [campo.id]: 'mañana' } })).status).toBe(400);
      expect((await guardar({ entity: 'COMPANY', recordId: miCompanyId, values: { [campo.id]: '2026-09-30' } })).status).toBe(200);
    });
  });

  describe('guardar y leer', () => {
    it('saves and reads back the value', async () => {
      const campo = (await crear(texto)).body;
      await guardar({ entity: 'COMPANY', recordId: miCompanyId, values: { [campo.id]: '20512345678' } });
      expect((await leer(miCompanyId)).body.values[campo.id]).toBe('20512345678');
    });

    it('keeps one row per field and record, not one per save', async () => {
      const campo = (await crear(texto)).body;
      await guardar({ entity: 'COMPANY', recordId: miCompanyId, values: { [campo.id]: 'primero' } });
      await guardar({ entity: 'COMPANY', recordId: miCompanyId, values: { [campo.id]: 'segundo' } });
      // Sin el índice único, la segunda guardada dejaría dos filas y la lectura elegiría una al azar.
      expect(await prisma.customFieldValue.count({ where: { fieldId: campo.id, recordId: miCompanyId } })).toBe(1);
      expect((await leer(miCompanyId)).body.values[campo.id]).toBe('segundo');
    });

    it('treats empty as no data and removes the row', async () => {
      const campo = (await crear(texto)).body;
      await guardar({ entity: 'COMPANY', recordId: miCompanyId, values: { [campo.id]: 'algo' } });
      await guardar({ entity: 'COMPANY', recordId: miCompanyId, values: { [campo.id]: '' } });
      // "Sin dato" tiene que ser la ausencia y no un "" que después hay que tratar como especial en
      // cada lectura.
      expect(await prisma.customFieldValue.count({ where: { fieldId: campo.id } })).toBe(0);
      expect((await leer(miCompanyId)).body.values[campo.id]).toBeUndefined();
    });

    it('rejects the whole save when one field does not belong here', async () => {
      const campo = (await crear(texto)).body;
      const otro = (await crear({ entity: 'DEAL', label: 'De otra ficha', type: 'TEXT' })).body;
      const res = await guardar({
        entity: 'COMPANY',
        recordId: miCompanyId,
        values: { [campo.id]: 'bueno', [otro.id]: 'colado' },
      });
      // Aceptar solo los válidos guardaría a medias sin que nadie se entere.
      expect(res.status).toBe(404);
      expect(await prisma.customFieldValue.count({ where: { recordId: miCompanyId } })).toBe(0);
    });

    it('does not let a vendedor write or read on a record that is not theirs', async () => {
      const campo = (await crear(texto)).body;
      expect((await guardar({ entity: 'COMPANY', recordId: ajenaCompanyId, values: { [campo.id]: 'intruso' } })).status).toBe(404);
      expect((await leer(ajenaCompanyId)).status).toBe(404);
    });

    it('does not cross entities', async () => {
      const campo = (await crear(texto)).body;
      const otroTenant = await prisma.tenant.create({ data: { name: 'Campos otro' } });
      const ajena = await prisma.company.create({ data: { tenantId: otroTenant.id, name: 'Total ajena', line: 'WEB' } });

      expect(
        (await guardar({ entity: 'COMPANY', recordId: ajena.id, values: { [campo.id]: 'x' } }, adminToken)).status
      ).toBe(404);

      await prisma.company.delete({ where: { id: ajena.id } });
      await prisma.tenant.delete({ where: { id: otroTenant.id } });
    });
  });

  describe('archivar', () => {
    it('hides the field but keeps the data', async () => {
      const campo = (await crear(texto)).body;
      await guardar({ entity: 'COMPANY', recordId: miCompanyId, values: { [campo.id]: 'se conserva' } });

      await request(app).patch(`/custom-fields/${campo.id}`).set('Authorization', `Bearer ${adminToken}`).send({ archived: true });
      const lista = await request(app).get('/custom-fields').set('Authorization', `Bearer ${adminToken}`);
      expect(lista.body).toHaveLength(0);
      // Archivar y no borrar: lo que ya se cargó se conserva y el campo puede volver.
      expect(await prisma.customFieldValue.count({ where: { fieldId: campo.id } })).toBe(1);

      await request(app).patch(`/custom-fields/${campo.id}`).set('Authorization', `Bearer ${adminToken}`).send({ archived: false });
      expect((await request(app).get('/custom-fields').set('Authorization', `Bearer ${adminToken}`)).body).toHaveLength(1);
    });

    it('does not let the type change once it exists', async () => {
      const campo = (await crear(texto)).body;
      await request(app)
        .patch(`/custom-fields/${campo.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ type: 'NUMBER', label: 'RUC' });
      // Pasar un campo con datos de Texto a Número dejaría valores que ya no validan, y no hay forma
      // de convertir "más o menos 30" en un número.
      expect((await prisma.customField.findUniqueOrThrow({ where: { id: campo.id } })).type).toBe('TEXT');
    });
  });
});
