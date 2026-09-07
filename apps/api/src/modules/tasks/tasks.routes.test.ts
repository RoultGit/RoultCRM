import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { signAccessToken } from '../../lib/tokens.js';

describe('/tasks routes', () => {
  const app = createApp();
  let tenantId: string;
  let adminToken: string;
  let sellerToken: string;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test-access-secret';
    tenantId = (await prisma.tenant.create({ data: { name: 'Tasks Route Tenant' } })).id;
    adminToken = signAccessToken({ userId: 'admin-1', tenantId, role: 'ADMIN' });
    sellerToken = signAccessToken({ userId: 'seller-1', tenantId, role: 'VENDEDOR' });
  });

  afterAll(async () => {
    await prisma.task.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.task.deleteMany({ where: { tenantId } });
  });

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/tasks');
    expect(res.status).toBe(401);
  });

  it('creates a task owned by the vendedor who created it', async () => {
    const res = await request(app)
      .post('/tasks')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ title: 'Llamar a ABC SAC', dueDate: '2026-09-08' });
    expect(res.status).toBe(201);
    expect(res.body.ownerId).toBe('seller-1');
    expect(res.body.done).toBe(false);
    expect(res.body.dueDate).toBe('2026-09-08T00:00:00.000Z');
  });

  it('ignores a vendedor trying to create a task for someone else', async () => {
    const res = await request(app)
      .post('/tasks')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ title: 'Para otro', dueDate: '2026-09-08', ownerId: 'admin-1' });
    expect(res.status).toBe(201);
    expect(res.body.ownerId).toBe('seller-1');
  });

  it('hides another user’s tasks from a vendedor', async () => {
    await request(app)
      .post('/tasks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Tarea del admin', dueDate: '2026-09-08' });

    const res = await request(app).get('/tasks').set('Authorization', `Bearer ${sellerToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });

  it('shows an admin every task in the tenant', async () => {
    await request(app)
      .post('/tasks')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ title: 'Tarea del vendedor', dueDate: '2026-09-08' });

    const res = await request(app).get('/tasks').set('Authorization', `Bearer ${adminToken}`);
    expect(res.body).toHaveLength(1);
  });

  it('marks a task as done', async () => {
    const created = await request(app)
      .post('/tasks')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ title: 'Llamar a ABC SAC', dueDate: '2026-09-08' });

    const res = await request(app)
      .patch(`/tasks/${created.body.id}`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ done: true });
    expect(res.status).toBe(200);
    expect(res.body.done).toBe(true);
  });

  it('refuses to let a vendedor touch another user’s task', async () => {
    const created = await request(app)
      .post('/tasks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Tarea del admin', dueDate: '2026-09-08' });

    const res = await request(app)
      .patch(`/tasks/${created.body.id}`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ done: true });
    expect(res.status).toBe(404);
  });

  it('rejects a task with an invalid due date', async () => {
    const res = await request(app)
      .post('/tasks')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ title: 'Sin fecha', dueDate: 'mañana' });
    expect(res.status).toBe(400);
  });
});
