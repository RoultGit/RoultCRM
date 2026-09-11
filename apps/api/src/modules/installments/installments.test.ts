import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { signAccessToken } from '../../lib/tokens.js';
import { splitAmount } from '@roult/shared';

const hoy = () => new Date().toISOString().slice(0, 10);
const enDias = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

describe('/installments — cobranza', () => {
  const app = createApp();
  let tenantId: string;
  let otroTenantId: string;
  let adminToken: string;
  let sellerToken: string;
  let sellerId: string;
  let miDealId: string;
  let ajenoDealId: string;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test-access-secret';
    tenantId = (await prisma.tenant.create({ data: { name: 'Cobranza Tenant' } })).id;
    otroTenantId = (await prisma.tenant.create({ data: { name: 'Cobranza Otro' } })).id;
    adminToken = signAccessToken({ userId: 'cob-admin', tenantId, role: 'ADMIN' });
    sellerId = (
      await prisma.user.create({
        data: {
          tenantId,
          email: `cob-${Date.now()}@roult.pe`,
          passwordHash: 'x',
          firstName: 'Cobra',
          lastName: 'Seller',
          role: 'VENDEDOR',
        },
      })
    ).id;
    sellerToken = signAccessToken({ userId: sellerId, tenantId, role: 'VENDEDOR' });
  });

  afterAll(async () => {
    for (const id of [tenantId, otroTenantId]) {
      await prisma.installment.deleteMany({ where: { tenantId: id } });
      await prisma.deal.deleteMany({ where: { tenantId: id } });
      await prisma.company.deleteMany({ where: { tenantId: id } });
      await prisma.user.deleteMany({ where: { tenantId: id } });
      await prisma.tenant.delete({ where: { id } });
    }
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    for (const id of [tenantId, otroTenantId]) {
      await prisma.installment.deleteMany({ where: { tenantId: id } });
      await prisma.deal.deleteMany({ where: { tenantId: id } });
      await prisma.company.deleteMany({ where: { tenantId: id } });
    }
    const empresa = await prisma.company.create({
      data: { tenantId, name: 'Cliente Cobranza', line: 'WEB', assignedUserId: sellerId },
    });
    miDealId = (
      await prisma.deal.create({
        data: { tenantId, companyId: empresa.id, title: 'Web', amount: 6200, currency: 'PEN', assignedUserId: sellerId },
      })
    ).id;
    ajenoDealId = (
      await prisma.deal.create({
        data: { tenantId, companyId: empresa.id, title: 'Del admin', amount: 1000, currency: 'PEN', assignedUserId: 'cob-admin' },
      })
    ).id;
  });

  const generar = (body: Record<string, unknown>, token = sellerToken) =>
    request(app).post('/installments/generate').set('Authorization', `Bearer ${token}`).send({ dealId: miDealId, ...body });

  const listar = (query = '', token = sellerToken) =>
    request(app).get(`/installments${query}`).set('Authorization', `Bearer ${token}`);

  describe('generar el plan', () => {
    it('adelanto y saldo parte el total como corresponde', async () => {
      const res = await generar({ plan: 'ADELANTO_SALDO', upfrontPct: 50, balanceDays: 30 });
      expect(res.status).toBe(201);
      expect(res.body).toHaveLength(2);
      expect(res.body[0]).toMatchObject({ amount: 3100, currency: 'PEN' });
      expect(res.body[1].amount).toBe(3100);
      expect(res.body[0].concept).toContain('Adelanto');
    });

    it('un adelanto del 30% deja el 70% de saldo', async () => {
      const res = await generar({ plan: 'ADELANTO_SALDO', upfrontPct: 30 });
      expect(res.body[0].amount).toBe(1860);
      expect(res.body[1].amount).toBe(4340);
    });

    it('cuotas iguales no pierde ni inventa centavos', async () => {
      const res = await generar({ plan: 'CUOTAS_IGUALES', count: 3 });
      const montos = res.body.map((i: { amount: number }) => i.amount);
      // 6200 / 3 = 2066.666…; redondeando cada una por su lado el estado de cuenta no cerraría.
      expect(montos.reduce((a: number, b: number) => a + b, 0)).toBe(6200);
      expect(montos).toEqual([2066.66, 2066.66, 2066.68]);
    });

    it('el plan mensual cobra el monto de la venta cada mes', async () => {
      await prisma.deal.update({ where: { id: miDealId }, data: { amount: 600, billingType: 'MONTHLY' } });
      const res = await generar({ plan: 'MENSUAL', count: 12 });
      expect(res.body).toHaveLength(12);
      expect(res.body.every((i: { amount: number }) => i.amount === 600)).toBe(true);
      expect(res.body[11].concept).toContain('12 de 12');
    });

    it('vuelve a generar reemplazando lo que no se cobró y dejando lo pagado', async () => {
      const primero = (await generar({ plan: 'CUOTAS_IGUALES', count: 2 })).body;
      await request(app)
        .post(`/installments/${primero[0].id}/pay`)
        .set('Authorization', `Bearer ${sellerToken}`)
        .send({});

      const segundo = await generar({ plan: 'CUOTAS_IGUALES', count: 4 });
      expect(segundo.status).toBe(201);
      const todas = (await listar(`?dealId=${miDealId}`)).body;
      // Lo ya cobrado no se puede borrar por rehacer el plan: es plata que entró.
      expect(todas.filter((i: { paidAt: string | null }) => i.paidAt).length).toBe(1);
      expect(todas).toHaveLength(5);
    });

    it('no deja generar sobre una venta que no es suya', async () => {
      expect((await generar({ plan: 'CUOTAS_IGUALES', count: 2, dealId: ajenoDealId })).status).toBe(404);
    });

    it('no deja generar sobre una venta de otra empresa', async () => {
      const otra = await prisma.company.create({ data: { tenantId: otroTenantId, name: 'Ajena', line: 'WEB' } });
      const ajeno = await prisma.deal.create({
        data: { tenantId: otroTenantId, companyId: otra.id, title: 'X', amount: 100, currency: 'PEN' },
      });
      expect((await generar({ plan: 'CUOTAS_IGUALES', count: 2, dealId: ajeno.id }, adminToken)).status).toBe(404);
    });
  });

  describe('registrar el pago', () => {
    const unaCuota = async () => (await generar({ plan: 'CUOTAS_IGUALES', count: 1 })).body[0];

    it('marca la cuota y guarda con qué se pagó', async () => {
      const cuota = await unaCuota();
      const res = await request(app)
        .post(`/installments/${cuota.id}/pay`)
        .set('Authorization', `Bearer ${sellerToken}`)
        .send({ method: 'Transferencia', paidAmount: 6195 });
      expect(res.status).toBe(200);
      expect(res.body.paidAt).not.toBeNull();
      // Lo que entró de verdad puede no ser igual al monto: comisiones del banco, redondeo.
      expect(res.body.paidAmount).toBe(6195);
      expect(res.body.method).toBe('Transferencia');
    });

    it('sin monto, se asume que entró lo que decía la cuota', async () => {
      const cuota = await unaCuota();
      const res = await request(app)
        .post(`/installments/${cuota.id}/pay`)
        .set('Authorization', `Bearer ${sellerToken}`)
        .send({});
      expect(res.body.paidAmount).toBe(6200);
    });

    it('se puede deshacer si se marcó por error', async () => {
      const cuota = await unaCuota();
      await request(app).post(`/installments/${cuota.id}/pay`).set('Authorization', `Bearer ${sellerToken}`).send({});
      const res = await request(app)
        .post(`/installments/${cuota.id}/unpay`)
        .set('Authorization', `Bearer ${sellerToken}`);
      expect(res.status).toBe(200);
      expect(res.body.paidAt).toBeNull();
      expect(res.body.paidAmount).toBeNull();
    });

    it('una cuota cobrada no se edita', async () => {
      const cuota = await unaCuota();
      await request(app).post(`/installments/${cuota.id}/pay`).set('Authorization', `Bearer ${sellerToken}`).send({});
      // Cambiarle el monto a algo ya cobrado deja el estado de cuenta mintiendo.
      const res = await request(app)
        .patch(`/installments/${cuota.id}`)
        .set('Authorization', `Bearer ${sellerToken}`)
        .send({ amount: 1 });
      expect(res.status).toBe(409);
    });

    it('un vendedor no cobra sobre una venta ajena', async () => {
      const ajena = await request(app)
        .post('/installments/generate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ dealId: ajenoDealId, plan: 'CUOTAS_IGUALES', count: 1 });
      const res = await request(app)
        .post(`/installments/${ajena.body[0].id}/pay`)
        .set('Authorization', `Bearer ${sellerToken}`)
        .send({});
      expect(res.status).toBe(404);
    });
  });

  describe('lo que falta cobrar', () => {
    it('marca como vencida solo la que no se pagó y ya pasó', async () => {
      await request(app)
        .post('/installments')
        .set('Authorization', `Bearer ${sellerToken}`)
        .send({ dealId: miDealId, concept: 'Vencida', amount: 100, dueDate: enDias(-5) });
      await request(app)
        .post('/installments')
        .set('Authorization', `Bearer ${sellerToken}`)
        .send({ dealId: miDealId, concept: 'Por vencer', amount: 200, dueDate: enDias(10) });

      const todas = (await listar(`?dealId=${miDealId}`)).body;
      expect(todas.find((i: { concept: string }) => i.concept === 'Vencida').overdue).toBe(true);
      expect(todas.find((i: { concept: string }) => i.concept === 'Por vencer').overdue).toBe(false);
    });

    it('la que vence hoy todavía no está vencida', async () => {
      await request(app)
        .post('/installments')
        .set('Authorization', `Bearer ${sellerToken}`)
        .send({ dealId: miDealId, concept: 'Hoy', amount: 100, dueDate: hoy() });
      const todas = (await listar(`?dealId=${miDealId}`)).body;
      // Una cuota que vence hoy se puede cobrar hoy: llamar al cliente para reclamarle sería un error.
      expect(todas[0].overdue).toBe(false);
    });

    it('suma por moneda y nunca todo junto', async () => {
      const empresa = await prisma.company.findFirstOrThrow({ where: { tenantId } });
      const enDolares = await prisma.deal.create({
        data: { tenantId, companyId: empresa.id, title: 'USD', amount: 1000, currency: 'USD', assignedUserId: sellerId },
      });
      await generar({ plan: 'CUOTAS_IGUALES', count: 1 });
      await generar({ plan: 'CUOTAS_IGUALES', count: 1, dealId: enDolares.id });

      const res = await request(app).get('/installments/totals').set('Authorization', `Bearer ${sellerToken}`);
      expect(res.status).toBe(200);
      // Sumar soles con dólares no es un total, es un error con formato de moneda.
      expect(res.body.pending).toEqual({ PEN: 6200, USD: 1000 });
    });

    it('un vendedor solo ve la cobranza de sus ventas', async () => {
      await generar({ plan: 'CUOTAS_IGUALES', count: 1 });
      await request(app)
        .post('/installments/generate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ dealId: ajenoDealId, plan: 'CUOTAS_IGUALES', count: 1 });

      expect((await listar()).body).toHaveLength(1);
      expect((await listar('', adminToken)).body).toHaveLength(2);
    });

    it('filtra lo vencido', async () => {
      await request(app)
        .post('/installments')
        .set('Authorization', `Bearer ${sellerToken}`)
        .send({ dealId: miDealId, concept: 'Vieja', amount: 100, dueDate: enDias(-20) });
      await request(app)
        .post('/installments')
        .set('Authorization', `Bearer ${sellerToken}`)
        .send({ dealId: miDealId, concept: 'Nueva', amount: 100, dueDate: enDias(20) });
      const res = await listar('?status=overdue');
      expect(res.body).toHaveLength(1);
      expect(res.body[0].concept).toBe('Vieja');
    });
  });

  describe('borrar la venta', () => {
    it('se lleva su cobranza', async () => {
      await generar({ plan: 'CUOTAS_IGUALES', count: 3 });
      await prisma.deal.delete({ where: { id: miDealId } });
      // Sin la cascada quedarían cuotas huérfanas cobrándole a nadie.
      expect(await prisma.installment.count({ where: { dealId: miDealId } })).toBe(0);
    });
  });

  describe('el reparto de montos', () => {
    it('no pierde ni inventa centavos', () => {
      expect(splitAmount(6200, 3)).toEqual([2066.66, 2066.66, 2066.68]);
      expect(splitAmount(100, 3).reduce((a, b) => a + b, 0)).toBe(100);
      expect(splitAmount(0.03, 2)).toEqual([0.01, 0.02]);
    });
  });
});
