import { Router } from 'express';
import { createUserSchema, updateUserSchema, setUserStatusSchema, userFiltersSchema } from '@roult/shared';
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

usersRouter.patch<{ id: string }>('/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const parsed = updateUserSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    const user = await UsersService.update(req.user!.tenantId, req.params.id, parsed.data, req.user!.userId);
    res.json(user);
  } catch (err) {
    next(err);
  }
});

usersRouter.patch<{ id: string }>('/:id/status', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const parsed = setUserStatusSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    const user = await UsersService.setStatus(req.user!.tenantId, req.params.id, parsed.data.status);
    res.json(user);
  } catch (err) {
    next(err);
  }
});

// Resetear el acceso de alguien es de ADMIN, y solo dentro de su propia empresa: findByIdAndTenant
// se encarga de que un id de otra entidad no exista para este actor.
usersRouter.post<{ id: string }>('/:id/password/reset', requireRole('ADMIN'), async (req, res, next) => {
  try {
    res.json(await UsersService.resetPassword(req.user!, req.params.id));
  } catch (err) {
    next(err);
  }
});
