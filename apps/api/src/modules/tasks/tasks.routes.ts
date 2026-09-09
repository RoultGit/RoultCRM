import { Router } from 'express';
import { createTaskSchema, updateTaskSchema, taskStatusSchema, createTaskUpdateSchema } from '@roult/shared';
import { TasksService } from './tasks.service.js';
import { requireAuth } from '../../middleware/auth.js';
import { ValidationError } from '../../lib/errors.js';

export const tasksRouter = Router();

tasksRouter.use(requireAuth);

tasksRouter.get('/', async (req, res, next) => {
  try {
    res.json(await TasksService.list(req.user!));
  } catch (err) {
    next(err);
  }
});

tasksRouter.post('/', async (req, res, next) => {
  try {
    const parsed = createTaskSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    res.status(201).json(await TasksService.create(req.user!, parsed.data));
  } catch (err) {
    next(err);
  }
});

tasksRouter.patch('/:id', async (req, res, next) => {
  try {
    const parsed = updateTaskSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    res.json(await TasksService.update(req.user!, req.params.id, parsed.data));
  } catch (err) {
    next(err);
  }
});

tasksRouter.patch<{ id: string }>('/:id/status', async (req, res, next) => {
  try {
    const parsed = taskStatusSchema.safeParse(req.body?.status);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    res.json(await TasksService.setStatus(req.user!, req.params.id, parsed.data));
  } catch (err) {
    next(err);
  }
});

tasksRouter.get<{ id: string }>('/:id/updates', async (req, res, next) => {
  try {
    res.json(await TasksService.listUpdates(req.user!, req.params.id));
  } catch (err) {
    next(err);
  }
});

tasksRouter.post<{ id: string }>('/:id/updates', async (req, res, next) => {
  try {
    const parsed = createTaskUpdateSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    res.status(201).json(await TasksService.addUpdate(req.user!, req.params.id, parsed.data));
  } catch (err) {
    next(err);
  }
});
