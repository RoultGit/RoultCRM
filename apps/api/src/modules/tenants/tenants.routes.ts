import { Router } from 'express';
import { createTenantSchema } from '@roult/shared';
import { TenantsService } from './tenants.service.js';
import { requireAuth, requirePlatformOwner } from '../../middleware/auth.js';
import { ValidationError } from '../../lib/errors.js';

export const tenantsRouter = Router();

// El permiso se corta para TODO el router, no ruta por ruta: acá una ruta nueva que se olvide del
// guard quedaría abierta a cualquier admin de cualquier empresa cliente.
tenantsRouter.use(requireAuth, requirePlatformOwner);

tenantsRouter.get('/', async (req, res, next) => {
  try {
    res.json(await TenantsService.list(req.user!));
  } catch (err) {
    next(err);
  }
});

tenantsRouter.post('/', async (req, res, next) => {
  try {
    const parsed = createTenantSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    res.status(201).json(await TenantsService.create(req.user!, parsed.data));
  } catch (err) {
    next(err);
  }
});

tenantsRouter.patch<{ id: string }>('/:id/suspend', async (req, res, next) => {
  try {
    const suspended = req.body?.suspended !== false;
    res.json(await TenantsService.suspend(req.user!, req.params.id, suspended));
  } catch (err) {
    next(err);
  }
});

tenantsRouter.delete<{ id: string }>('/:id', async (req, res, next) => {
  try {
    const confirmName = typeof req.body?.confirmName === 'string' ? req.body.confirmName : '';
    await TenantsService.remove(req.user!, req.params.id, confirmName);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
