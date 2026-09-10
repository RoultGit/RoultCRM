import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createHmac } from 'node:crypto';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { signAccessToken } from '../../lib/tokens.js';
import { seal } from '../../lib/secretBox.js';

const PHONE_ID = 'phone-id-de-prueba';
const APP_SECRET = 'secreto-de-la-app';

describe('/whatsapp', () => {
  const app = createApp();
  let tenantId: string;
  let otroTenantId: string;
  let adminToken: string;
  let sellerToken: string;
  let sellerId: string;
  let miCompanyId: string;
  let ajenaCompanyId: string;
  let contactId: string;

  const respuestaOk = () =>
    vi.fn(async () => new Response(JSON.stringify({ messages: [{ id: 'wamid.123' }] }), { status: 200 }));

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test-access-secret';
    process.env.ENCRYPTION_KEY = 'clave-de-pruebas-con-mas-de-32-caracteres-ok';
    tenantId = (await prisma.tenant.create({ data: { name: 'WA Tenant' } })).id;
    otroTenantId = (await prisma.tenant.create({ data: { name: 'WA Otro' } })).id;
    adminToken = signAccessToken({ userId: 'wa-admin', tenantId, role: 'ADMIN' });
    sellerId = (
      await prisma.user.create({
        data: {
          tenantId,
          email: `wa-${Date.now()}@roult.pe`,
          passwordHash: 'x',
          firstName: 'Wa',
          lastName: 'Seller',
          role: 'VENDEDOR',
        },
      })
    ).id;
    sellerToken = signAccessToken({ userId: sellerId, tenantId, role: 'VENDEDOR' });
  });

  afterAll(async () => {
    for (const id of [tenantId, otroTenantId]) {
      await prisma.activity.deleteMany({ where: { tenantId: id } });
      await prisma.whatsAppAccount.deleteMany({ where: { tenantId: id } });
      await prisma.contact.deleteMany({ where: { tenantId: id } });
      await prisma.lead.deleteMany({ where: { tenantId: id } });
      await prisma.company.deleteMany({ where: { tenantId: id } });
      await prisma.user.deleteMany({ where: { tenantId: id } });
      await prisma.tenant.delete({ where: { id } });
    }
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    vi.unstubAllGlobals();
    await prisma.activity.deleteMany({ where: { tenantId } });
    await prisma.whatsAppAccount.deleteMany({ where: { tenantId } });
    await prisma.contact.deleteMany({ where: { tenantId } });
    await prisma.lead.deleteMany({ where: { tenantId } });
    await prisma.company.deleteMany({ where: { tenantId } });
    miCompanyId = (
      await prisma.company.create({ data: { tenantId, name: 'Del vendedor', line: 'WEB', assignedUserId: sellerId } })
    ).id;
    ajenaCompanyId = (
      await prisma.company.create({ data: { tenantId, name: 'Del admin', line: 'WEB', assignedUserId: 'wa-admin' } })
    ).id;
    contactId = (
      await prisma.contact.create({
        data: { tenantId, companyId: miCompanyId, name: 'Rosa', whatsapp: '987 654 321' },
      })
    ).id;
  });

  const conectar = () =>
    request(app)
      .post('/whatsapp/connect')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ phoneNumberId: PHONE_ID, accessToken: 'EAAG'.padEnd(40, 'x'), appSecret: APP_SECRET });

  describe('conectar la cuenta', () => {
    it('no la conecta un vendedor', async () => {
      const res = await request(app)
        .post('/whatsapp/connect')
        .set('Authorization', `Bearer ${sellerToken}`)
        .send({ phoneNumberId: PHONE_ID, accessToken: 'EAAG'.padEnd(40, 'x') });
      expect(res.status).toBe(403);
    });

    it('guarda el token cifrado y no lo devuelve nunca', async () => {
      const res = await conectar();
      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body)).not.toContain('EAAG');
      const fila = await prisma.whatsAppAccount.findUniqueOrThrow({ where: { tenantId } });
      // En claro, quien lea la base habla en nombre del cliente con sus propios clientes.
      expect(fila.accessToken).not.toContain('EAAG');
      expect(fila.verifyToken).toHaveLength(32);
    });

    it('al reconectar conserva el token de verificación', async () => {
      const primero = (await conectar()).body.verifyToken;
      const segundo = (await conectar()).body.verifyToken;
      // Cambiarlo rompería el webhook ya dado de alta en Meta y nadie relaciona una cosa con la otra.
      expect(segundo).toBe(primero);
    });

    it('sin ENCRYPTION_KEY se niega a guardar credenciales', async () => {
      const previa = process.env.ENCRYPTION_KEY;
      delete process.env.ENCRYPTION_KEY;
      expect((await conectar()).status).toBe(400);
      process.env.ENCRYPTION_KEY = previa;
    });
  });

  describe('mandar un mensaje', () => {
    it('lo deja anotado en la historia del cliente', async () => {
      await conectar();
      const fetchMock = respuestaOk();
      vi.stubGlobal('fetch', fetchMock);

      const res = await request(app)
        .post('/whatsapp/send')
        .set('Authorization', `Bearer ${sellerToken}`)
        .send({ relatedType: 'CONTACT', relatedId: contactId, to: '987654321', body: 'Hola Rosa' });

      expect(res.status).toBe(200);
      const enviado = JSON.parse(fetchMock.mock.calls[0][1].body);
      // Meta pide el número sin espacios y con país: un "987 654 321" no llega y la API no avisa.
      expect(enviado.to).toBe('51987654321');
      const historia = await prisma.activity.findMany({ where: { tenantId, relatedId: contactId } });
      expect(historia).toHaveLength(1);
      expect(historia[0].body).toBe('Hola Rosa');
    });

    it('cuando Meta rechaza, no inventa historia y deja el error a la vista', async () => {
      await conectar();
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response(JSON.stringify({ error: { code: 131047, message: 'Re-engagement' } }), { status: 400 }))
      );
      const res = await request(app)
        .post('/whatsapp/send')
        .set('Authorization', `Bearer ${sellerToken}`)
        .send({ relatedType: 'CONTACT', relatedId: contactId, to: '987654321', body: 'Hola' });

      expect(res.status).toBe(502);
      expect(res.body.error).toContain('24 horas');
      // Anotar un mensaje que no salió es peor que no anotar nada: el vendedor cree que avisó.
      expect(await prisma.activity.count({ where: { tenantId } })).toBe(0);
      const estado = await request(app).get('/whatsapp/status').set('Authorization', `Bearer ${adminToken}`);
      expect(estado.body.lastError).toContain('24 horas');
    });

    it('un vendedor no puede escribirle a un cliente que no es suyo', async () => {
      await conectar();
      vi.stubGlobal('fetch', respuestaOk());
      const res = await request(app)
        .post('/whatsapp/send')
        .set('Authorization', `Bearer ${sellerToken}`)
        .send({ relatedType: 'COMPANY', relatedId: ajenaCompanyId, to: '987654321', body: 'Hola' });
      expect(res.status).toBe(404);
    });

    it('sin cuenta conectada avisa en vez de fallar', async () => {
      const res = await request(app)
        .post('/whatsapp/send')
        .set('Authorization', `Bearer ${sellerToken}`)
        .send({ relatedType: 'CONTACT', relatedId: contactId, to: '987654321', body: 'Hola' });
      expect(res.status).toBe(400);
    });
  });

  describe('el webhook', () => {
    const firmar = (body: unknown) =>
      'sha256=' + createHmac('sha256', APP_SECRET).update(JSON.stringify(body)).digest('hex');

    const mensaje = (from: string, text: string, nombre?: string) => ({
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: PHONE_ID },
                ...(nombre ? { contacts: [{ profile: { name: nombre }, wa_id: from }] } : {}),
                messages: [{ from, type: 'text', text: { body: text } }],
              },
            },
          ],
        },
      ],
    });

    const entrar = (body: unknown, firma?: string) =>
      request(app)
        .post('/whatsapp/webhook')
        .set('Content-Type', 'application/json')
        .set(firma ? { 'X-Hub-Signature-256': firma } : {})
        .send(JSON.stringify(body));

    it('el apretón de manos solo pasa con el token de una cuenta conectada', async () => {
      const verifyToken = (await conectar()).body.verifyToken;
      const malo = await request(app).get(
        '/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=inventado&hub.challenge=1234'
      );
      expect(malo.status).toBe(403);
      const bueno = await request(app).get(
        `/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${verifyToken}&hub.challenge=1234`
      );
      expect(bueno.text).toBe('1234');
    });

    it('guarda lo que escribe el cliente en la ficha de su contacto', async () => {
      await conectar();
      const body = mensaje('51987654321', 'Necesito una cotización');
      const res = await entrar(body, firmar(body));
      expect(res.status).toBe(200);

      const historia = await prisma.activity.findMany({ where: { tenantId, relatedId: contactId } });
      expect(historia).toHaveLength(1);
      // El teléfono está cargado como "987 654 321": si no se comparan solo los dígitos, no matchea.
      expect(historia[0].body).toBe('Necesito una cotización');
      expect(historia[0].authorId).toBe('whatsapp:inbound');
    });

    it('sin la firma correcta no anota nada', async () => {
      await conectar();
      const body = mensaje('51987654321', 'Mensaje falsificado');
      // Sin verificar, cualquiera que sepa la URL inventa conversaciones dentro del CRM de un cliente.
      await entrar(body, 'sha256=' + 'a'.repeat(64));
      await entrar(body);
      expect(await prisma.activity.count({ where: { tenantId } })).toBe(0);
    });

    it('un número desconocido se convierte en lead, y el segundo mensaje va al mismo lead', async () => {
      await conectar();
      const primero = mensaje('51999888777', 'Hola, vi su web', 'Panadería Luna');
      await entrar(primero, firmar(primero));
      const leads = await prisma.lead.findMany({ where: { tenantId } });
      expect(leads).toHaveLength(1);
      expect(leads[0].businessName).toBe('Panadería Luna');
      expect(leads[0].source).toBe('WhatsApp');

      const segundo = mensaje('51999888777', '¿Cuánto sale?', 'Panadería Luna');
      await entrar(segundo, firmar(segundo));
      // Un lead nuevo por cada mensaje llenaría el tablero de duplicados del mismo interesado.
      expect(await prisma.lead.count({ where: { tenantId } })).toBe(1);
      expect(await prisma.activity.count({ where: { tenantId, relatedId: leads[0].id } })).toBe(2);
    });

    it('un número que no es de ninguna cuenta conectada se ignora', async () => {
      await conectar();
      const body = {
        entry: [
          {
            changes: [
              {
                value: {
                  metadata: { phone_number_id: 'de-otra-empresa' },
                  messages: [{ from: '51987654321', type: 'text', text: { body: 'Hola' } }],
                },
              },
            ],
          },
        ],
      };
      await entrar(body, firmar(body));
      expect(await prisma.activity.count({ where: { tenantId } })).toBe(0);
    });

    it('el mensaje de una empresa no cae en la ficha de otra', async () => {
      await conectar();
      // Otra empresa cliente con un contacto que tiene EL MISMO número.
      const otraCompany = await prisma.company.create({ data: { tenantId: otroTenantId, name: 'Vecina', line: 'WEB' } });
      const otroContacto = await prisma.contact.create({
        data: { tenantId: otroTenantId, companyId: otraCompany.id, name: 'Rosa también', whatsapp: '987654321' },
      });
      const body = mensaje('51987654321', 'Para la primera empresa');
      await entrar(body, firmar(body));
      expect(await prisma.activity.count({ where: { tenantId: otroTenantId, relatedId: otroContacto.id } })).toBe(0);
      expect(await prisma.activity.count({ where: { tenantId, relatedId: contactId } })).toBe(1);
    });
  });
});
