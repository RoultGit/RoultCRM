import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { signAccessToken } from '../../lib/tokens.js';

describe('/attachments', () => {
  const app = createApp();
  let tenantId: string;
  let otroTenantId: string;
  let adminToken: string;
  let sellerToken: string;
  let sellerId: string;
  let miCompanyId: string;
  let ajenaCompanyId: string;

  /** El almacenamiento se simula: lo que se prueba acá es la puerta, no el bucket de Supabase. */
  const storageOk = () =>
    vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.includes('/object/upload/sign/')) {
        return new Response(JSON.stringify({ url: '/object/upload/sign/adjuntos/x?token=t', token: 't' }), { status: 200 });
      }
      if (u.includes('/object/info/')) return new Response(JSON.stringify({ size: 1234 }), { status: 200 });
      if (u.includes('/object/sign/')) {
        return new Response(JSON.stringify({ signedURL: '/object/sign/adjuntos/x?token=firmado' }), { status: 200 });
      }
      return new Response('', { status: 200 });
    });

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test-access-secret';
    process.env.SUPABASE_URL = 'https://proyecto.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'clave-de-servicio-de-prueba';
    tenantId = (await prisma.tenant.create({ data: { name: 'Adjuntos Tenant' } })).id;
    otroTenantId = (await prisma.tenant.create({ data: { name: 'Adjuntos Otro' } })).id;
    adminToken = signAccessToken({ userId: 'adj-admin', tenantId, role: 'ADMIN' });
    sellerId = (
      await prisma.user.create({
        data: { tenantId, email: `adj-${Date.now()}@roult.pe`, passwordHash: 'x', firstName: 'A', lastName: 'B', role: 'VENDEDOR' },
      })
    ).id;
    sellerToken = signAccessToken({ userId: sellerId, tenantId, role: 'VENDEDOR' });
  });

  afterAll(async () => {
    for (const id of [tenantId, otroTenantId]) {
      await prisma.attachment.deleteMany({ where: { tenantId: id } });
      await prisma.company.deleteMany({ where: { tenantId: id } });
      await prisma.user.deleteMany({ where: { tenantId: id } });
      await prisma.tenant.delete({ where: { id } });
    }
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    vi.unstubAllGlobals();
    vi.stubGlobal('fetch', storageOk());
    await prisma.attachment.deleteMany({ where: { tenantId } });
    await prisma.company.deleteMany({ where: { tenantId } });
    miCompanyId = (await prisma.company.create({ data: { tenantId, name: 'Del vendedor', line: 'WEB', assignedUserId: sellerId } })).id;
    ajenaCompanyId = (await prisma.company.create({ data: { tenantId, name: 'Del admin', line: 'WEB', assignedUserId: 'adj-admin' } })).id;
  });

  const pedir = (body: Record<string, unknown> = {}, token = sellerToken) =>
    request(app)
      .post('/attachments/upload-url')
      .set('Authorization', `Bearer ${token}`)
      .send({
        relatedType: 'COMPANY',
        relatedId: miCompanyId,
        name: 'Contrato firmado.pdf',
        size: 1234,
        mimeType: 'application/pdf',
        ...body,
      });

  const subirYConfirmar = async () => {
    const { body } = await pedir();
    return request(app).post(`/attachments/${body.id}/confirm`).set('Authorization', `Bearer ${sellerToken}`);
  };

  describe('subir', () => {
    it('devuelve una URL para que el navegador suba directo', async () => {
      const res = await pedir();
      expect(res.status).toBe(201);
      // Pasando por la API, el límite de 4,5 MB del cuerpo serverless sería el techo del archivo.
      expect(res.body.uploadUrl).toContain('/object/upload/sign/');
      expect(res.body.id).toBeTruthy();
    });

    it('la ruta lleva el tenant adelante', async () => {
      const { body } = await pedir();
      const fila = await prisma.attachment.findUniqueOrThrow({ where: { id: body.id } });
      // Un archivo nunca puede quedar servido desde la carpeta de otra empresa.
      expect(fila.path.startsWith(`${tenantId}/`)).toBe(true);
    });

    it('rechaza un tipo que no está en la lista blanca', async () => {
      // Esto se descarga después en el navegador de otra persona: nada ejecutable.
      expect((await pedir({ mimeType: 'application/x-msdownload', name: 'virus.exe' })).status).toBe(400);
      expect((await pedir({ mimeType: 'text/html', name: 'x.html' })).status).toBe(400);
    });

    it('rechaza un archivo más grande que el tope', async () => {
      expect((await pedir({ size: 25 * 1024 * 1024 })).status).toBe(400);
      expect((await pedir({ size: 0 })).status).toBe(400);
    });

    it('un vendedor no puede colgar archivos de un cliente ajeno', async () => {
      expect((await pedir({ relatedId: ajenaCompanyId })).status).toBe(404);
    });

    it('no se puede colgar de una ficha de otra empresa', async () => {
      const ajena = await prisma.company.create({ data: { tenantId: otroTenantId, name: 'Total ajena', line: 'WEB' } });
      expect((await pedir({ relatedId: ajena.id }, adminToken)).status).toBe(404);
    });

    it('sin almacenamiento configurado avisa en vez de fallar feo', async () => {
      const previa = process.env.SUPABASE_SERVICE_ROLE_KEY;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      const res = await pedir();
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('almacenamiento');
      process.env.SUPABASE_SERVICE_ROLE_KEY = previa;
    });
  });

  describe('confirmar', () => {
    it('recién ahí el archivo aparece en la ficha', async () => {
      const { body } = await pedir();
      // Antes de confirmar no existe: una subida cortada dejaría un adjunto que no se puede abrir.
      const antes = await request(app)
        .get(`/attachments?relatedType=COMPANY&relatedId=${miCompanyId}`)
        .set('Authorization', `Bearer ${sellerToken}`);
      expect(antes.body).toHaveLength(0);

      const conf = await request(app).post(`/attachments/${body.id}/confirm`).set('Authorization', `Bearer ${sellerToken}`);
      expect(conf.status).toBe(200);

      const despues = await request(app)
        .get(`/attachments?relatedType=COMPANY&relatedId=${miCompanyId}`)
        .set('Authorization', `Bearer ${sellerToken}`);
      expect(despues.body).toHaveLength(1);
      expect(despues.body[0].name).toBe('Contrato firmado.pdf');
    });

    it('el tamaño que vale es el del almacenamiento, no el que dijo el navegador', async () => {
      const { body } = await pedir({ size: 10 });
      const conf = await request(app).post(`/attachments/${body.id}/confirm`).set('Authorization', `Bearer ${sellerToken}`);
      // Si valiera el declarado, se podría reportar 1 KB y subir 20 MB.
      expect(conf.body.size).toBe(1234);
    });

    it('si el archivo no llegó, la fila se borra', async () => {
      const { body } = await pedir();
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string | URL) =>
          String(url).includes('/object/info/') ? new Response('', { status: 404 }) : new Response('{}', { status: 200 })
        )
      );
      const conf = await request(app).post(`/attachments/${body.id}/confirm`).set('Authorization', `Bearer ${sellerToken}`);
      expect(conf.status).toBe(400);
      expect(await prisma.attachment.count({ where: { id: body.id } })).toBe(0);
    });
  });

  describe('leer y borrar', () => {
    it('la descarga es un link firmado que vence', async () => {
      await subirYConfirmar();
      const res = await request(app)
        .get(`/attachments?relatedType=COMPANY&relatedId=${miCompanyId}`)
        .set('Authorization', `Bearer ${sellerToken}`);
      // El bucket es privado: con uno público la dirección de un contrato queda accesible para
      // siempre a quien la tenga.
      expect(res.body[0].downloadUrl).toContain('token=firmado');
      expect(res.body[0].downloadUrl).toContain('download=');
    });

    it('un vendedor no ve los adjuntos de un cliente ajeno', async () => {
      const res = await request(app)
        .get(`/attachments?relatedType=COMPANY&relatedId=${ajenaCompanyId}`)
        .set('Authorization', `Bearer ${sellerToken}`);
      expect(res.status).toBe(404);
    });

    it('borrar saca el archivo del almacenamiento y la fila', async () => {
      const conf = await subirYConfirmar();
      const borrado = vi.fn(async (url: string | URL) =>
        String(url).includes('/object/adjuntos/') ? new Response('', { status: 200 }) : new Response('{}', { status: 200 })
      );
      vi.stubGlobal('fetch', borrado);

      const res = await request(app).delete(`/attachments/${conf.body.id}`).set('Authorization', `Bearer ${sellerToken}`);
      expect(res.status).toBe(204);
      // Borrar solo la fila dejaría bytes pagados en el bucket que ya nadie puede encontrar.
      expect(borrado.mock.calls.some((c) => String(c[0]).includes('/object/adjuntos/'))).toBe(true);
      expect(await prisma.attachment.count({ where: { id: conf.body.id } })).toBe(0);
    });
  });
});
