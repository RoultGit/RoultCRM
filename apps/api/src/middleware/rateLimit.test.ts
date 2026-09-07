import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { rateLimit } from './rateLimit.js';

describe('rateLimit', () => {
  const app = express();
  app.post('/probar', rateLimit({ windowMs: 60_000, max: 3, message: 'basta' }), (_req, res) => {
    res.json({ ok: true });
  });

  it('lets through up to the limit and blocks after it', async () => {
    for (let i = 0; i < 3; i++) {
      expect((await request(app).post('/probar')).status).toBe(200);
    }
    const blocked = await request(app).post('/probar');
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toBe('basta');
    expect(blocked.headers['retry-after']).toBeTruthy();
  });
  it('forgets the count once the attempt succeeds', async () => {
    const ok = express();
    const limiter = rateLimit({ windowMs: 60_000, max: 2, message: 'basta' });
    ok.post('/entrar', limiter, (req, res) => {
      limiter.reset(req);
      res.json({ ok: true });
    });

    // Muchos más intentos que el tope, pero todos exitosos: nunca bloquea.
    for (let i = 0; i < 6; i++) {
      expect((await request(ok).post('/entrar')).status).toBe(200);
    }
  });
});
