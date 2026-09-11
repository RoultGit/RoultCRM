import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { signAccessToken } from '../../lib/tokens.js';
import { quoteTotals } from '@roult/shared';

describe('/quotes', () => {
  const app = createApp();
  let tenantId: string;
  let otroTenantId: string;
  let adminToken: string;
  let sellerToken: string;
  let sellerId: string;
  let miCompanyId: string;
  let ajenaCompanyId: string;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test-access-secret';
    tenantId = (await prisma.tenant.create({ data: { name: 'Cotiza Tenant' } })).id;
    otroTenantId = (await prisma.tenant.create({ data: { name: 'Cotiza Otro' } })).id;
    adminToken = signAccessToken({ userId: 'cot-admin', tenantId, role: 'ADMIN' });
    sellerId = (
      await prisma.user.create({
        data: {
          tenantId,
          email: `cot-${Date.now()}@roult.pe`,
          passwordHash: 'x',
          firstName: 'Cotiza',
          lastName: 'Seller',
          role: 'VENDEDOR',
        },
      })
    ).id;
    sellerToken = signAccessToken({ userId: sellerId, tenantId, role: 'VENDEDOR' });
  });

  afterAll(async () => {
    for (const id of [tenantId, otroTenantId]) {
      await prisma.quoteItem.deleteMany({ where: { quote: { tenantId: id } } });
      await prisma.quote.deleteMany({ where: { tenantId: id } });
      await prisma.activity.deleteMany({ where: { tenantId: id } });
      await prisma.company.deleteMany({ where: { tenantId: id } });
      await prisma.user.deleteMany({ where: { tenantId: id } });
      await prisma.tenant.delete({ where: { id } });
    }
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    for (const id of [tenantId, otroTenantId]) {
      await prisma.quoteItem.deleteMany({ where: { quote: { tenantId: id } } });
      await prisma.quote.deleteMany({ where: { tenantId: id } });
      await prisma.activity.deleteMany({ where: { tenantId: id } });
      await prisma.company.deleteMany({ where: { tenantId: id } });
    }
    miCompanyId = (
      await prisma.company.create({ data: { tenantId, name: 'Del vendedor', line: 'WEB', assignedUserId: sellerId } })
    ).id;
    ajenaCompanyId = (
      await prisma.company.create({ data: { tenantId, name: 'Del admin', line: 'WEB', assignedUserId: 'cot-admin' } })
    ).id;
  });

  const base = {
    title: 'Sitio web institucional',
    currency: 'PEN' as const,
    taxRate: 18,
    items: [
      { description: 'Diseño', quantity: 1, unitPrice: 3000 },
      { description: 'Horas de desarrollo', quantity: 40, unitPrice: 80 },
    ],
  };

  const crear = (body: Record<string, unknown> = {}, token = sellerToken) =>
    request(app)
      .post('/quotes')
      .set('Authorization', `Bearer ${token}`)
      .send({ companyId: miCompanyId, ...base, ...body });

  const enviar = (id: string, token = sellerToken) =>
    request(app).post(`/quotes/${id}/send`).set('Authorization', `Bearer ${token}`);

  describe('crear', () => {
    it('rechaza sin sesión', async () => {
      expect((await request(app).get('/quotes')).status).toBe(401);
    });

    it('numera correlativo por empresa, empezando en 1', async () => {
      expect((await crear()).body.number).toBe(1);
      expect((await crear()).body.number).toBe(2);
      // La numeración es de la empresa, no global: el cliente ve "Cotización 1", no un salto raro.
      const otra = await prisma.company.create({ data: { tenantId: otroTenantId, name: 'Vecina', line: 'WEB' } });
      const vecinaToken = signAccessToken({ userId: 'v-admin', tenantId: otroTenantId, role: 'ADMIN' });
      const suya = await request(app)
        .post('/quotes')
        .set('Authorization', `Bearer ${vecinaToken}`)
        .send({ companyId: otra.id, ...base });
      expect(suya.body.number).toBe(1);
    });

    it('calcula subtotal, IGV y total', async () => {
      const res = await crear();
      // 3000 + 40×80 = 6200; IGV 18% = 1116; total 7316
      expect(res.body).toMatchObject({ subtotal: 6200, tax: 1116, total: 7316 });
    });

    it('deja poner IGV cero para lo exonerado o al exterior', async () => {
      const res = await crear({ taxRate: 0, currency: 'USD' });
      expect(res.body).toMatchObject({ tax: 0, total: 6200 });
    });

    it('no acepta una cotización sin líneas', async () => {
      expect((await crear({ items: [] })).status).toBe(400);
    });

    it('no deja cotizarle a un cliente de otra empresa', async () => {
      const ajena = await prisma.company.create({ data: { tenantId: otroTenantId, name: 'Total ajena', line: 'WEB' } });
      expect((await crear({ companyId: ajena.id }, adminToken)).status).toBe(404);
    });

    it('no deja a un vendedor cotizarle a un cliente que no es suyo', async () => {
      expect((await crear({ companyId: ajenaCompanyId })).status).toBe(404);
    });

    it('nace en borrador y sin link público', async () => {
      const res = await crear();
      expect(res.body.status).toBe('DRAFT');
      // El link no existe hasta que se envía: si existiera desde el borrador, un vendedor podría
      // pasarle por error un precio que todavía estaba armando.
      expect(res.body.publicUrl).toBeNull();
    });
  });

  describe('listar y ver', () => {
    it('un vendedor solo ve las suyas', async () => {
      await crear();
      await request(app)
        .post('/quotes')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ companyId: ajenaCompanyId, ...base });

      expect((await request(app).get('/quotes').set('Authorization', `Bearer ${sellerToken}`)).body).toHaveLength(1);
      expect((await request(app).get('/quotes').set('Authorization', `Bearer ${adminToken}`)).body).toHaveLength(2);
    });

    it('filtra por cliente', async () => {
      await crear();
      const res = await request(app)
        .get(`/quotes?companyId=${miCompanyId}`)
        .set('Authorization', `Bearer ${sellerToken}`);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].companyName).toBe('Del vendedor');
    });
  });

  describe('editar', () => {
    it('se puede corregir mientras es borrador', async () => {
      const quote = (await crear()).body;
      const res = await request(app)
        .patch(`/quotes/${quote.id}`)
        .set('Authorization', `Bearer ${sellerToken}`)
        .send({ items: [{ description: 'Todo junto', quantity: 1, unitPrice: 5000 }] });
      expect(res.status).toBe(200);
      expect(res.body.subtotal).toBe(5000);
      expect(res.body.items).toHaveLength(1);
    });

    it('NO se puede cambiar una ya enviada', async () => {
      const quote = (await crear()).body;
      await enviar(quote.id);
      // Cambiar los números de algo que el cliente ya tiene en la mano es la peor clase de bug.
      const res = await request(app)
        .patch(`/quotes/${quote.id}`)
        .set('Authorization', `Bearer ${sellerToken}`)
        .send({ items: [{ description: 'Más caro', quantity: 1, unitPrice: 99999 }] });
      expect(res.status).toBe(409);
    });
  });

  describe('enviar y el link público', () => {
    it('al enviar aparece el link', async () => {
      const quote = (await crear()).body;
      const res = await enviar(quote.id);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('SENT');
      expect(res.body.publicUrl).toContain('/cotizacion/');
    });

    it('el cliente la abre sin cuenta y queda registrado cuándo la vio', async () => {
      const quote = (await crear()).body;
      const token = (await enviar(quote.id)).body.publicUrl.split('/cotizacion/')[1];

      const publica = await request(app).get(`/quotes/public/${token}`);
      expect(publica.status).toBe(200);
      expect(publica.body).toMatchObject({ number: 1, total: 7316, canRespond: true });
      expect(publica.body.companyName).toBe('Del vendedor');

      const enBase = await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } });
      // Es lo que un PDF adjunto nunca va a poder decir.
      expect(enBase.viewedAt).not.toBeNull();
    });

    it('la vista pública no filtra nada del equipo de ventas', async () => {
      const quote = (await crear()).body;
      const token = (await enviar(quote.id)).body.publicUrl.split('/cotizacion/')[1];
      const cuerpo = JSON.stringify((await request(app).get(`/quotes/public/${token}`)).body);
      for (const secreto of [sellerId, miCompanyId, quote.id, tenantId]) {
        expect(cuerpo).not.toContain(secreto);
      }
    });

    it('un token inventado no existe', async () => {
      expect((await request(app).get('/quotes/public/lo-que-sea')).status).toBe(404);
    });

    it('un borrador no se puede abrir por el link', async () => {
      const quote = (await crear()).body;
      const enBase = await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } });
      expect((await request(app).get(`/quotes/public/${enBase.publicToken}`)).status).toBe(404);
    });
  });

  describe('la respuesta del cliente', () => {
    const conToken = async () => {
      const quote = (await crear()).body;
      const url = (await enviar(quote.id)).body.publicUrl;
      return { id: quote.id, token: url.split('/cotizacion/')[1] };
    };

    it('aceptar la marca y deja quién aceptó', async () => {
      const { id, token } = await conToken();
      const res = await request(app)
        .post(`/quotes/public/${token}/respond`)
        .send({ accept: true, respondedBy: 'Rosa Delgado' });
      expect(res.status).toBe(200);

      const enBase = await prisma.quote.findUniqueOrThrow({ where: { id } });
      expect(enBase.status).toBe('ACCEPTED');
      expect(enBase.respondedBy).toBe('Rosa Delgado');
      expect(enBase.respondedAt).not.toBeNull();
    });

    it('rechazar también queda registrado', async () => {
      const { id, token } = await conToken();
      await request(app).post(`/quotes/public/${token}/respond`).send({ accept: false, respondedBy: 'Rosa' });
      expect((await prisma.quote.findUniqueOrThrow({ where: { id } })).status).toBe('REJECTED');
    });

    it('la respuesta queda en el historial del cliente', async () => {
      const { token } = await conToken();
      await request(app).post(`/quotes/public/${token}/respond`).send({ accept: true, respondedBy: 'Rosa' });
      const historia = await prisma.activity.findMany({ where: { tenantId, relatedId: miCompanyId } });
      expect(historia).toHaveLength(1);
      expect(historia[0].body).toContain('aceptó');
    });

    it('no se puede responder dos veces', async () => {
      const { token } = await conToken();
      await request(app).post(`/quotes/public/${token}/respond`).send({ accept: true, respondedBy: 'Rosa' });
      // Sin esto, alguien podría "des-aceptar" una cotización cerrada apretando el otro botón.
      const segunda = await request(app)
        .post(`/quotes/public/${token}/respond`)
        .send({ accept: false, respondedBy: 'Rosa' });
      expect(segunda.status).toBe(409);
    });

    it('una vencida se puede leer pero no aceptar', async () => {
      const quote = (await crear({ validUntil: '2020-01-01' })).body;
      const token = (await enviar(quote.id)).body.publicUrl.split('/cotizacion/')[1];

      const publica = await request(app).get(`/quotes/public/${token}`);
      expect(publica.status).toBe(200);
      expect(publica.body.canRespond).toBe(false);

      const intento = await request(app)
        .post(`/quotes/public/${token}/respond`)
        .send({ accept: true, respondedBy: 'Tarde' });
      expect(intento.status).toBe(409);
    });

    it('pide el nombre de quien responde', async () => {
      const { token } = await conToken();
      expect((await request(app).post(`/quotes/public/${token}/respond`).send({ accept: true })).status).toBe(400);
    });
  });

  describe('borrar', () => {
    it('un borrador se borra con sus líneas', async () => {
      const quote = (await crear()).body;
      expect((await request(app).delete(`/quotes/${quote.id}`).set('Authorization', `Bearer ${sellerToken}`)).status).toBe(204);
      expect(await prisma.quoteItem.count({ where: { quoteId: quote.id } })).toBe(0);
    });

    it('una aceptada no se borra', async () => {
      const quote = (await crear()).body;
      const token = (await enviar(quote.id)).body.publicUrl.split('/cotizacion/')[1];
      await request(app).post(`/quotes/public/${token}/respond`).send({ accept: true, respondedBy: 'Rosa' });
      // Es el respaldo de lo que el cliente aceptó: no puede desaparecer porque a alguien le moleste.
      expect((await request(app).delete(`/quotes/${quote.id}`).set('Authorization', `Bearer ${adminToken}`)).status).toBe(409);
    });
  });

  describe('las cuentas', () => {
    it('no arrastra el error del punto flotante', () => {
      // 0.1 + 0.2 en punto flotante da 0.30000000000000004; en un total que el cliente firma, eso
      // es un centavo que alguien va a tener que explicar.
      const t = quoteTotals([{ quantity: 3, unitPrice: 0.1 }], 0);
      expect(t.total).toBe(0.3);
    });

    it('redondea el IGV a dos decimales', () => {
      const t = quoteTotals([{ quantity: 1, unitPrice: 33.33 }], 18);
      expect(t.tax).toBe(6);
      expect(t.total).toBe(39.33);
    });
  });
});
