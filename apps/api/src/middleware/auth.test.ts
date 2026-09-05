import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { signAccessToken } from '../lib/tokens.js';
import { requireAuth, requireRole } from './auth.js';

function buildTestApp() {
  const app = express();
  app.get('/whoami', requireAuth, (req, res) => res.json(req.user));
  app.get('/admin-only', requireAuth, requireRole('ADMIN'), (_req, res) => res.json({ ok: true }));
  app.use((err: any, _req: any, res: any, _next: any) => {
    res.status(err.statusCode ?? 500).json({ error: err.message });
  });
  return app;
}

describe('requireAuth', () => {
  const app = buildTestApp();

  it('rejects requests with no Authorization header', async () => {
    const res = await request(app).get('/whoami');
    expect(res.status).toBe(401);
  });

  it('rejects an invalid token', async () => {
    const res = await request(app).get('/whoami').set('Authorization', 'Bearer garbage');
    expect(res.status).toBe(401);
  });

  it('attaches req.user for a valid token', async () => {
    process.env.JWT_ACCESS_SECRET = 'test-access-secret';
    const token = signAccessToken({ userId: 'u1', tenantId: 't1', role: 'VENDEDOR' });
    const res = await request(app).get('/whoami').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ userId: 'u1', tenantId: 't1', role: 'VENDEDOR' });
  });
});

describe('requireRole', () => {
  const app = buildTestApp();

  it('rejects a VENDEDOR from an ADMIN-only route', async () => {
    process.env.JWT_ACCESS_SECRET = 'test-access-secret';
    const token = signAccessToken({ userId: 'u1', tenantId: 't1', role: 'VENDEDOR' });
    const res = await request(app).get('/admin-only').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('allows an ADMIN through', async () => {
    process.env.JWT_ACCESS_SECRET = 'test-access-secret';
    const token = signAccessToken({ userId: 'u1', tenantId: 't1', role: 'ADMIN' });
    const res = await request(app).get('/admin-only').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});
