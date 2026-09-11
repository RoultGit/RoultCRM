import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { signAccessToken } from '../../lib/tokens.js';

describe('acciones en lote sobre leads', () => {
  const app = createApp();
  let tenantId: string;
  let adminToken: string;
  let anaToken: string;
  let anaId: string;
  let brunoId: string;
  let deAna: string[];
  let deBruno: string[];

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test-access-secret';
    tenantId = (await prisma.tenant.create({ data: { name: 'Lote Tenant' } })).id;
    adminToken = signAccessToken({ userId: 'lote-admin', tenantId, role: 'ADMIN' });
    const crear = async (n: string) =>
      (
        await prisma.user.create({
          data: { tenantId, email: `${n}-${Date.now()}@roult.pe`, passwordHash: 'x', firstName: n, lastName: 'L', role: 'VENDEDOR' },
        })
      ).id;
    anaId = await crear('ana');
    brunoId = await crear('bruno');
    anaToken = signAccessToken({ userId: anaId, tenantId, role: 'VENDEDOR' });
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { tenantId } });
    await prisma.lead.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // La auditoría también, si no las líneas de una prueba se cuentan en la siguiente.
    await prisma.auditLog.deleteMany({ where: { tenantId } });
    await prisma.lead.deleteMany({ where: { tenantId } });
    const crear = async (n: number, dueño: string) => {
      const ids: string[] = [];
      for (let i = 0; i < n; i += 1) {
        const l = await prisma.lead.create({
          data: { tenantId, businessName: `L${i}-${dueño}`, contactName: 'x', line: 'WEB', assignedUserId: dueño },
        });
        ids.push(l.id);
      }
      return ids;
    };
    deAna = await crear(3, anaId);
    deBruno = await crear(2, brunoId);
  });

  const asignar = (body: Record<string, unknown>, token = adminToken) =>
    request(app).post('/leads/bulk/assign').set('Authorization', `Bearer ${token}`).send(body);

  it('el admin reasigna varios de una vez', async () => {
    const res = await asignar({ ids: [...deAna, ...deBruno], assignedUserId: brunoId });
    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(5);
    expect(await prisma.lead.count({ where: { tenantId, assignedUserId: brunoId } })).toBe(5);
  });

  it('los deja sin asignar si se manda null', async () => {
    await asignar({ ids: deAna, assignedUserId: null });
    expect(await prisma.lead.count({ where: { tenantId, assignedUserId: null } })).toBe(3);
  });

  it('un vendedor NO puede pasarle leads a otro', async () => {
    // Reasignar la cartera de otro es del administrador.
    expect((await asignar({ ids: deAna, assignedUserId: brunoId }, anaToken)).status).toBe(403);
  });

  it('un vendedor sí puede tomar para sí, pero solo lo que ya es suyo', async () => {
    const res = await asignar({ ids: [...deAna, ...deBruno], assignedUserId: anaId }, anaToken);
    expect(res.status).toBe(200);
    // Los dos de Bruno no matchean el alcance, así que no se tocan. Filtrando en memoria en vez de
    // en el UPDATE, estos dos habrían cambiado de dueño.
    expect(res.body.updated).toBe(3);
    expect(await prisma.lead.count({ where: { tenantId, assignedUserId: brunoId } })).toBe(2);
  });

  it('no se puede asignar a alguien que no está en el equipo', async () => {
    expect((await asignar({ ids: deAna, assignedUserId: 'no-existe' })).status).toBe(400);
  });

  it('no se pueden tocar leads de otra empresa', async () => {
    const otro = await prisma.tenant.create({ data: { name: 'Lote Otro' } });
    const ajeno = await prisma.lead.create({
      data: { tenantId: otro.id, businessName: 'Ajeno', contactName: 'x', line: 'WEB' },
    });
    const res = await asignar({ ids: [ajeno.id], assignedUserId: anaId });
    expect(res.body.updated).toBe(0);
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: ajeno.id } })).assignedUserId).toBeNull();
    await prisma.lead.deleteMany({ where: { tenantId: otro.id } });
    await prisma.tenant.delete({ where: { id: otro.id } });
  });

  it('tiene tope: reasignar de a mil de una vez es casi siempre un clic equivocado', async () => {
    const muchos = Array.from({ length: 250 }, (_, i) => `id-${i}`);
    expect((await asignar({ ids: muchos, assignedUserId: anaId })).status).toBe(400);
  });

  it('cambia el estado de varios', async () => {
    const res = await request(app)
      .post('/leads/bulk/status')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ids: deAna, status: 'CONTACTED' });
    expect(res.body.updated).toBe(3);
    expect(await prisma.lead.count({ where: { tenantId, status: 'CONTACTED' } })).toBe(3);
  });

  it('queda UNA línea en la auditoría, no una por lead', async () => {
    await asignar({ ids: deAna, assignedUserId: brunoId });
    const logs = await prisma.auditLog.findMany({ where: { tenantId, action: 'ASSIGN' } });
    // Una por lead llenaría la auditoría sin decir nada más que lo que dice esta.
    expect(logs).toHaveLength(1);
    expect(logs[0].entityId).toBe('bulk:3');
  });
});
