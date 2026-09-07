import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { signAccessToken } from '../../lib/tokens.js';

describe('/search routes', () => {
  const app = createApp();
  let tenantId: string;
  let token: string;
  let sellerId: string;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test-access-secret';
    tenantId = (await prisma.tenant.create({ data: { name: 'Search Tenant' } })).id;
    token = signAccessToken({ userId: 'admin-1', tenantId, role: 'ADMIN' });
    sellerId = (
      await prisma.user.create({
        data: {
          tenantId,
          email: `search-seller-${Date.now()}@roult.pe`,
          passwordHash: 'x',
          firstName: 'Buscable',
          lastName: 'Vendedor',
          role: 'VENDEDOR',
        },
      })
    ).id;
    const company = await prisma.company.create({
      data: { tenantId, name: 'ABC SAC', line: 'WEB', assignedUserId: sellerId },
    });
    await prisma.contact.create({ data: { tenantId, companyId: company.id, name: 'Carlos ABC' } });
    await prisma.lead.create({
      data: { tenantId, businessName: 'ABC Prospecto', contactName: 'Ana', line: 'WEB', assignedUserId: sellerId },
    });
    await prisma.deal.create({
      data: {
        tenantId,
        companyId: company.id,
        title: 'Web ABC',
        amount: '100',
        currency: 'PEN',
        assignedUserId: sellerId,
      },
    });
  });

  afterAll(async () => {
    await prisma.deal.deleteMany({ where: { tenantId } });
    await prisma.contact.deleteMany({ where: { tenantId } });
    await prisma.lead.deleteMany({ where: { tenantId } });
    await prisma.company.deleteMany({ where: { tenantId } });
    await prisma.auditLog.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  it('rejects unauthenticated requests', async () => {
    expect((await request(app).get('/search?q=ABC')).status).toBe(401);
  });

  it('finds matches across every entity', async () => {
    const res = await request(app).get('/search?q=ABC').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const types = res.body.results.map((r: { type: string }) => r.type);
    expect(types).toContain('COMPANY');
    expect(types).toContain('CONTACT');
    expect(types).toContain('LEAD');
    expect(types).toContain('DEAL');
  });

  it('matches case-insensitively', async () => {
    const res = await request(app).get('/search?q=abc%20sac').set('Authorization', `Bearer ${token}`);
    expect(res.body.results.some((r: { label: string }) => r.label === 'ABC SAC')).toBe(true);
  });

  it('returns nothing for a blank query instead of everything', async () => {
    const res = await request(app).get('/search?q=%20').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(0);
  });

  it('hides another vendedor’s records from a vendedor', async () => {
    const other = signAccessToken({ userId: 'seller-other', tenantId, role: 'VENDEDOR' });
    const res = await request(app).get('/search?q=ABC').set('Authorization', `Bearer ${other}`);
    const types = res.body.results.map((r: { type: string }) => r.type);
    expect(types).not.toContain('COMPANY');
    expect(types).not.toContain('DEAL');
    expect(types).not.toContain('LEAD');
    expect(types).not.toContain('CONTACT');
  });

  it('shows a vendedor their own records', async () => {
    const seller = signAccessToken({ userId: sellerId, tenantId, role: 'VENDEDOR' });
    const res = await request(app).get('/search?q=ABC').set('Authorization', `Bearer ${seller}`);
    const types = res.body.results.map((r: { type: string }) => r.type);
    expect(types).toContain('COMPANY');
    expect(types).toContain('DEAL');
  });

  it('finds vendedores by name', async () => {
    const res = await request(app).get('/search?q=Buscable').set('Authorization', `Bearer ${token}`);
    expect(res.body.results.some((r: { type: string }) => r.type === 'USER')).toBe(true);
  });
});
