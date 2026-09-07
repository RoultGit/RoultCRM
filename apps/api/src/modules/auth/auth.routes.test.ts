import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { hashPassword } from '../../lib/password.js';

describe('POST /auth/login', () => {
  let tenantId: string;
  const app = createApp();

  beforeAll(async () => {
    const tenant = await prisma.tenant.create({ data: { name: 'Route Test Tenant' } });
    tenantId = tenant.id;
  });

  afterAll(async () => {
    await prisma.refreshToken.deleteMany({ where: { user: { tenantId } } });
    await prisma.auditLog.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.refreshToken.deleteMany({ where: { user: { tenantId } } });
    await prisma.auditLog.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.user.create({
      data: {
        tenantId,
        email: 'route@test.com',
        passwordHash: await hashPassword('secret123'),
        firstName: 'Route',
        lastName: 'Test',
        role: 'ADMIN',
      },
    });
  });

  it('returns 200 and sets a refresh cookie on valid credentials', async () => {
    const res = await request(app).post('/auth/login').send({ email: 'route@test.com', password: 'secret123' });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTypeOf('string');
    expect(res.headers['set-cookie']?.[0]).toMatch(/refreshToken=/);
  });

  it('returns 401 on invalid credentials', async () => {
    const res = await request(app).post('/auth/login').send({ email: 'route@test.com', password: 'wrong' });
    expect(res.status).toBe(401);
  });

  it('returns 400 on malformed body', async () => {
    const res = await request(app).post('/auth/login').send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
  });
  it('returns the logged-in user from /auth/me', async () => {
    const login = await request(app).post('/auth/login').send({ email: 'route@test.com', password: 'secret123' });
    const res = await request(app).get('/auth/me').set('Authorization', `Bearer ${login.body.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe('route@test.com');
    expect(res.body.role).toBe('ADMIN');
    expect(res.body.passwordHash).toBeUndefined();
  });

  it('rejects /auth/me without a token', async () => {
    const res = await request(app).get('/auth/me');
    expect(res.status).toBe(401);
  });
});
