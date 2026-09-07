import { Router } from 'express';
import { createUserSchema, updateUserSchema, setUserStatusSchema, userFiltersSchema } from '@ventry/shared';
import { UsersService } from './users.service.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { ValidationError } from '../../lib/errors.js';

export const usersRouter = Router();

usersRouter.use(requireAuth);

usersRouter.get('/', async (req, res, next) => {
  try {
    const parsed = userFiltersSchema.safeParse(req.query);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    const users = await UsersService.list(req.user!.tenantId, parsed.data);
    res.json(users);
  } catch (err) {
    next(err);
  }
});

usersRouter.post('/', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    const user = await UsersService.create(req.user!.tenantId, parsed.data);
    res.status(201).json(user);
  } catch (err) {
    next(err);
  }
});

usersRouter.patch('/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const parsed = updateUserSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    const user = await UsersService.update(req.user!.tenantId, req.params.id, parsed.data);
    res.json(user);
  } catch (err) {
    next(err);
  }
});

usersRouter.patch('/:id/status', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const parsed = setUserStatusSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    const user = await UsersService.setStatus(req.user!.tenantId, req.params.id, parsed.data.status);
    res.json(user);
  } catch (err) {
    next(err);
  }
});
