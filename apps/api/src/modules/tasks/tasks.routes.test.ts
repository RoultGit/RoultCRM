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
    await prisma.taskUpdate.deleteMany({ where: { tenantId } });
    await prisma.task.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.taskUpdate.deleteMany({ where: { tenantId } });
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
    expect(res.body.status).toBe('TODO');
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

  it('moves a task across the board', async () => {
    const created = await request(app)
      .post('/tasks')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ title: 'Llamar a ABC SAC', dueDate: '2026-09-08' });

    const res = await request(app)
      .patch(`/tasks/${created.body.id}/status`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ status: 'DOING' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('DOING');
  });

  it('saves an optional time and keeps null for an all-day task', async () => {
    const timed = await request(app)
      .post('/tasks')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ title: 'Reunión', dueDate: '2026-09-08', dueTime: '09:30' });
    expect(timed.body.dueTime).toBe('09:30');

    const allDay = await request(app)
      .post('/tasks')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ title: 'Todo el día', dueDate: '2026-09-08', dueTime: '' });
    expect(allDay.body.dueTime).toBeNull();

    const bad = await request(app)
      .post('/tasks')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ title: 'Hora imposible', dueDate: '2026-09-08', dueTime: '25:00' });
    expect(bad.status).toBe(400);
  });

  it('refuses to let a vendedor touch another user’s task', async () => {
    const created = await request(app)
      .post('/tasks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Tarea del admin', dueDate: '2026-09-08' });

    const res = await request(app)
      .patch(`/tasks/${created.body.id}`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ status: 'DONE' });
    expect(res.status).toBe(404);
  });

  it('records progress and refuses values outside 0-100', async () => {
    const created = await request(app)
      .post('/tasks')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ title: 'Con avance', dueDate: '2026-09-08', progress: 40 });
    expect(created.body.progress).toBe(40);

    for (const bad of [-1, 101, 33.5]) {
      const res = await request(app)
        .post('/tasks')
        .set('Authorization', `Bearer ${sellerToken}`)
        .send({ title: 'Avance imposible', dueDate: '2026-09-08', progress: bad });
      expect(res.status).toBe(400);
    }
  });

  it('starts at zero and jumps to 100 when the task is closed', async () => {
    const created = await request(app)
      .post('/tasks')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ title: 'Sin avance declarado', dueDate: '2026-09-08' });
    expect(created.body.progress).toBe(0);

    await request(app)
      .patch(`/tasks/${created.body.id}`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ progress: 60 });

    const done = await request(app)
      .patch(`/tasks/${created.body.id}/status`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ status: 'DONE' });
    // Una tarjeta que dice "Hecha" con la barra al 60% es una contradicción a la vista.
    expect(done.body.progress).toBe(100);
  });

  it('records who created the task, from the token and not the body', async () => {
    const res = await request(app)
      .post('/tasks')
      .set('Authorization', `Bearer ${sellerToken}`)
      // createdById en el body tiene que ser ignorado: si se respetara, cualquiera podría
      // atribuirle a otro una tarea que él cargó.
      .send({ title: 'Con autor', dueDate: '2026-09-08', createdById: 'otro-usuario' });
    expect(res.status).toBe(201);
    expect(res.body.createdById).toBe('seller-1');
  });

  it('records who closed it and forgets it when the task is reopened', async () => {
    const created = await request(app)
      .post('/tasks')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ title: 'Para cerrar', dueDate: '2026-09-08' });
    expect(created.body.completedById).toBeNull();

    const done = await request(app)
      .patch(`/tasks/${created.body.id}/status`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ status: 'DONE' });
    expect(done.body.completedById).toBe('seller-1');
    expect(done.body.completedAt).not.toBeNull();

    const reopened = await request(app)
      .patch(`/tasks/${created.body.id}/status`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ status: 'DOING' });
    // Una tarea en curso que siga diciendo "completada por Ana" es peor que no decir nada.
    expect(reopened.body.completedById).toBeNull();
    expect(reopened.body.completedAt).toBeNull();
  });

  it('registers the closing the same way from the edit form as from the board', async () => {
    const created = await request(app)
      .post('/tasks')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ title: 'Cerrada por formulario', dueDate: '2026-09-08' });

    const res = await request(app)
      .patch(`/tasks/${created.body.id}`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ status: 'DONE' });
    // El dato no puede depender de por dónde entró el cambio.
    expect(res.body.completedById).toBe('seller-1');
  });

  it('defaults priority to media and accepts the four levels', async () => {
    const plain = await request(app)
      .post('/tasks')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ title: 'Sin prioridad declarada', dueDate: '2026-09-08' });
    expect(plain.body.priority).toBe('MEDIUM');

    for (const priority of ['URGENT', 'HIGH', 'MEDIUM', 'LOW'] as const) {
      const res = await request(app)
        .post('/tasks')
        .set('Authorization', `Bearer ${sellerToken}`)
        .send({ title: `Prioridad ${priority}`, dueDate: '2026-09-08', priority });
      expect(res.body.priority).toBe(priority);
    }

    const bad = await request(app)
      .post('/tasks')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ title: 'Prioridad inventada', dueDate: '2026-09-08', priority: 'ALTISIMA' });
    expect(bad.status).toBe(400);
  });

  describe('avances de una tarea', () => {
    const makeTask = (token = sellerToken) =>
      request(app)
        .post('/tasks')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Con historial', dueDate: '2026-09-30' })
        .then((r) => r.body.id as string);

    it('records the update and moves the task progress with it', async () => {
      const id = await makeTask();
      const res = await request(app)
        .post(`/tasks/${id}/updates`)
        .set('Authorization', `Bearer ${sellerToken}`)
        .send({ note: 'Maqueta lista y aprobada', progress: 40 });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ note: 'Maqueta lista y aprobada', progress: 40, authorId: 'seller-1' });

      // El progreso de la tarea y el del avance son el mismo hecho: si se separaran, la barra
      // mostraría un número que ningún registro respalda.
      const task = await prisma.task.findUnique({ where: { id } });
      expect(task?.progress).toBe(40);
    });

    it('keeps the history newest first', async () => {
      const id = await makeTask();
      for (const [note, progress] of [['Arranque', 20], ['Mitad', 50], ['Casi', 90]] as const) {
        await request(app)
          .post(`/tasks/${id}/updates`)
          .set('Authorization', `Bearer ${sellerToken}`)
          .send({ note, progress });
      }
      const res = await request(app).get(`/tasks/${id}/updates`).set('Authorization', `Bearer ${sellerToken}`);
      expect(res.body.map((u: { note: string }) => u.note)).toEqual(['Casi', 'Mitad', 'Arranque']);
      expect((await prisma.task.findUnique({ where: { id } }))?.progress).toBe(90);
    });

    it('demands a note: a bare number is what this history replaces', async () => {
      const id = await makeTask();
      const res = await request(app)
        .post(`/tasks/${id}/updates`)
        .set('Authorization', `Bearer ${sellerToken}`)
        .send({ note: '', progress: 50 });
      expect(res.status).toBe(400);
    });

    it('rejects progress outside 0-100', async () => {
      const id = await makeTask();
      for (const progress of [-5, 140]) {
        const res = await request(app)
          .post(`/tasks/${id}/updates`)
          .set('Authorization', `Bearer ${sellerToken}`)
          .send({ note: 'Imposible', progress });
        expect(res.status).toBe(400);
      }
    });

    it('signs the update with the token, not with the body', async () => {
      const id = await makeTask();
      const res = await request(app)
        .post(`/tasks/${id}/updates`)
        .set('Authorization', `Bearer ${sellerToken}`)
        .send({ note: 'Firmado por otro', progress: 10, authorId: 'admin-1' });
      expect(res.body.authorId).toBe('seller-1');
    });

    it('does not let a vendedor read or write the history of someone else task', async () => {
      const otherTask = await makeTask(adminToken);
      // Con solo tener el id, un vendedor no puede espiar ni escribir en una tarea ajena.
      expect(
        (await request(app).get(`/tasks/${otherTask}/updates`).set('Authorization', `Bearer ${sellerToken}`)).status
      ).toBe(404);
      expect(
        (
          await request(app)
            .post(`/tasks/${otherTask}/updates`)
            .set('Authorization', `Bearer ${sellerToken}`)
            .send({ note: 'Intruso', progress: 99 })
        ).status
      ).toBe(404);
    });
  });

  it('rejects a task with an invalid due date', async () => {
    const res = await request(app)
      .post('/tasks')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ title: 'Sin fecha', dueDate: 'mañana' });
    expect(res.status).toBe(400);
  });
});
