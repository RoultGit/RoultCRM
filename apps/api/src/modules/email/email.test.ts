import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { signAccessToken } from '../../lib/tokens.js';
import { parseAddress } from './email.service.js';

const SECRETO = 'secreto-de-entrada-de-prueba';

describe('/email — correo entrante', () => {
  const app = createApp();
  let tenantId: string;
  let otroTenantId: string;
  let adminToken: string;
  let sellerToken: string;
  let vendedorEmail: string;
  let buzon: string;
  let companyId: string;
  let contactId: string;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test-access-secret';
    process.env.INBOUND_SECRET = SECRETO;
    process.env.INBOUND_DOMAIN = 'in.roult.pe';
    tenantId = (await prisma.tenant.create({ data: { name: 'Correo Tenant' } })).id;
    otroTenantId = (await prisma.tenant.create({ data: { name: 'Correo Otro' } })).id;
    adminToken = signAccessToken({ userId: 'mail-admin', tenantId, role: 'ADMIN' });
    vendedorEmail = `vendedora-${Date.now()}@roult.pe`;
    const seller = await prisma.user.create({
      data: { tenantId, email: vendedorEmail, passwordHash: 'x', firstName: 'Ana', lastName: 'V', role: 'VENDEDOR' },
    });
    sellerToken = signAccessToken({ userId: seller.id, tenantId, role: 'VENDEDOR' });
  });

  afterAll(async () => {
    for (const id of [tenantId, otroTenantId]) {
      await prisma.activity.deleteMany({ where: { tenantId: id } });
      await prisma.contact.deleteMany({ where: { tenantId: id } });
      await prisma.lead.deleteMany({ where: { tenantId: id } });
      await prisma.company.deleteMany({ where: { tenantId: id } });
      await prisma.user.deleteMany({ where: { tenantId: id } });
      await prisma.tenant.delete({ where: { id } });
    }
    delete process.env.INBOUND_SECRET;
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    for (const id of [tenantId, otroTenantId]) {
      await prisma.activity.deleteMany({ where: { tenantId: id } });
      await prisma.contact.deleteMany({ where: { tenantId: id } });
      await prisma.lead.deleteMany({ where: { tenantId: id } });
      await prisma.company.deleteMany({ where: { tenantId: id } });
    }
    const res = await request(app).post('/email/inbox').set('Authorization', `Bearer ${adminToken}`);
    buzon = res.body.address;
    companyId = (await prisma.company.create({ data: { tenantId, name: 'Cliente Correo', line: 'WEB' } })).id;
    contactId = (
      await prisma.contact.create({
        data: { tenantId, companyId, name: 'Rosa', email: 'rosa@cliente.pe' },
      })
    ).id;
  });

  const entrar = (body: Record<string, unknown>, secreto = SECRETO) =>
    request(app).post('/email/inbound').set('Authorization', `Bearer ${secreto}`).send(body);

  describe('el buzón', () => {
    it('lo activa el admin y la dirección es del dominio de entrada', async () => {
      expect(buzon).toMatch(/^[0-9a-f]{12}@in\.roult\.pe$/);
    });

    it('la dirección no se adivina desde el nombre de la empresa', async () => {
      // Si fuera "correotenant@", cualquiera podría meterle correos a la ficha de sus clientes.
      expect(buzon.toLowerCase()).not.toContain('correo tenant'.replace(' ', ''));
    });

    it('volver a activarlo devuelve la misma dirección', async () => {
      const otra = await request(app).post('/email/inbox').set('Authorization', `Bearer ${adminToken}`);
      // Cambiarla rompería las copias ocultas ya configuradas en los correos del equipo.
      expect(otra.body.address).toBe(buzon);
    });

    it('no lo activa un vendedor', async () => {
      expect((await request(app).post('/email/inbox').set('Authorization', `Bearer ${sellerToken}`)).status).toBe(403);
    });

    it('cada empresa tiene la suya', async () => {
      const otroAdmin = signAccessToken({ userId: 'otro-admin', tenantId: otroTenantId, role: 'ADMIN' });
      const otro = await request(app).post('/email/inbox').set('Authorization', `Bearer ${otroAdmin}`);
      expect(otro.body.address).not.toBe(buzon);
    });
  });

  describe('la puerta', () => {
    it('sin secreto configurado no atiende', async () => {
      const previo = process.env.INBOUND_SECRET;
      delete process.env.INBOUND_SECRET;
      expect((await entrar({})).status).toBe(503);
      process.env.INBOUND_SECRET = previo;
    });

    it('rechaza el secreto equivocado', async () => {
      expect((await entrar({}, 'otra-cosa')).status).toBe(401);
    });
  });

  describe('guardar en la ficha que corresponde', () => {
    it('un correo del cliente cae en su contacto', async () => {
      const res = await entrar({
        from: 'Rosa Delgado <rosa@cliente.pe>',
        to: [buzon, vendedorEmail],
        subject: 'Consulta por la propuesta',
        text: '¿Nos podemos reunir el jueves?',
      });
      expect(res.body.stored).toBe(true);

      const historia = await prisma.activity.findMany({ where: { tenantId, relatedId: contactId } });
      expect(historia).toHaveLength(1);
      expect(historia[0].type).toBe('EMAIL');
      expect(historia[0].body).toContain('Consulta por la propuesta');
      expect(historia[0].authorId).toBe('email:inbound');
    });

    it('lo que manda el vendedor con copia oculta también queda, a su nombre', async () => {
      const res = await entrar({
        from: vendedorEmail,
        to: ['rosa@cliente.pe'],
        cc: [buzon],
        subject: 'Te mando la propuesta',
        text: 'Adjunto lo conversado.',
      });
      expect(res.body.stored).toBe(true);
      const historia = await prisma.activity.findMany({ where: { tenantId, relatedId: contactId } });
      expect(historia).toHaveLength(1);
      // Lo escribió el vendedor, así que el historial tiene que decir su nombre y no "el cliente".
      expect(historia[0].authorId).not.toBe('email:inbound');
    });

    it('si no conocemos al que escribe, se abre un lead', async () => {
      await entrar({
        from: 'nuevo@panaderialuna.pe',
        to: [buzon],
        subject: 'Quiero una cotización',
        text: 'Vi su web.',
      });
      const leads = await prisma.lead.findMany({ where: { tenantId } });
      // Perder al que escribe de la nada sería el peor resultado posible de conectar el correo.
      expect(leads).toHaveLength(1);
      expect(leads[0].email).toBe('nuevo@panaderialuna.pe');
      expect(leads[0].source).toBe('Correo');
    });

    it('el segundo correo del mismo desconocido va al mismo lead', async () => {
      await entrar({ from: 'x@nuevo.pe', to: [buzon], subject: 'Uno', text: 'a', messageId: '<1@x>' });
      await entrar({ from: 'x@nuevo.pe', to: [buzon], subject: 'Dos', text: 'b', messageId: '<2@x>' });
      expect(await prisma.lead.count({ where: { tenantId } })).toBe(1);
      expect(await prisma.activity.count({ where: { tenantId } })).toBe(2);
    });

    it('no guarda el mismo correo dos veces', async () => {
      const correo = {
        from: 'rosa@cliente.pe',
        to: [buzon],
        subject: 'Una sola vez',
        text: 'hola',
        messageId: '<abc123@cliente.pe>',
      };
      expect((await entrar(correo)).body.stored).toBe(true);
      // Llega dos veces cuando va en copia oculta Y además el cliente responde a todos.
      expect((await entrar(correo)).body.stored).toBe(false);
      expect(await prisma.activity.count({ where: { tenantId } })).toBe(1);
    });
  });

  describe('lo que no se puede guardar', () => {
    it('ignora un correo que no va a ningún buzón nuestro', async () => {
      const res = await entrar({ from: 'a@b.pe', to: ['otro@dominio.pe'], subject: 'x', text: 'y' });
      expect(res.body.stored).toBe(false);
      expect(await prisma.activity.count({ where: { tenantId } })).toBe(0);
    });

    it('ignora un buzón que no existe', async () => {
      const res = await entrar({ from: 'a@b.pe', to: ['inventado@in.roult.pe'], subject: 'x', text: 'y' });
      expect(res.body.stored).toBe(false);
    });

    it('avisa cuando el reenvío no deja saber de qué cliente es', async () => {
      // El vendedor se reenvía a sí mismo sin dejar al cliente en copia: no hay contraparte.
      const res = await entrar({ from: vendedorEmail, to: [buzon], subject: 'fwd', text: 'mirá esto' });
      expect(res.body.stored).toBe(false);
      expect(res.body.reason).toContain('reenviado');
    });

    it('ignora un correo vacío', async () => {
      expect((await entrar({ from: 'rosa@cliente.pe', to: [buzon] })).body.stored).toBe(false);
    });

    it('contesta 200 igual, para que el proveedor no reintente para siempre', async () => {
      expect((await entrar({ from: 'a@b.pe', to: ['nada@nada.pe'] })).status).toBe(200);
    });
  });

  describe('aislamiento entre empresas', () => {
    it('el correo de una empresa no cae en la ficha de otra', async () => {
      const otroAdmin = signAccessToken({ userId: 'otro-admin', tenantId: otroTenantId, role: 'ADMIN' });
      const otroBuzon = (await request(app).post('/email/inbox').set('Authorization', `Bearer ${otroAdmin}`)).body.address;

      // Un contacto con el MISMO correo en las dos empresas.
      const otraCompany = await prisma.company.create({ data: { tenantId: otroTenantId, name: 'Vecina', line: 'WEB' } });
      const otroContacto = await prisma.contact.create({
        data: { tenantId: otroTenantId, companyId: otraCompany.id, name: 'Rosa también', email: 'rosa@cliente.pe' },
      });

      await entrar({ from: 'rosa@cliente.pe', to: [buzon], subject: 'Para la primera', text: 'a' });

      // La llave del buzón es lo único que separa una empresa de otra acá adentro.
      expect(await prisma.activity.count({ where: { tenantId, relatedId: contactId } })).toBe(1);
      expect(await prisma.activity.count({ where: { tenantId: otroTenantId, relatedId: otroContacto.id } })).toBe(0);
      expect(otroBuzon).not.toBe(buzon);
    });
  });

  describe('leer la dirección de un remitente', () => {
    it('saca el correo de un "Nombre <correo>"', () => {
      expect(parseAddress('Rosa Delgado <rosa@cliente.pe>')).toBe('rosa@cliente.pe');
      expect(parseAddress('  ROSA@Cliente.PE ')).toBe('rosa@cliente.pe');
      expect(parseAddress({ address: 'x@y.pe' })).toBe('x@y.pe');
    });

    it('devuelve nulo cuando no hay un correo de verdad', () => {
      expect(parseAddress('sin arroba')).toBeNull();
      expect(parseAddress('')).toBeNull();
      expect(parseAddress(undefined)).toBeNull();
    });
  });
});
