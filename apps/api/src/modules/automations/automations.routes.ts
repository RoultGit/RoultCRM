import { Router } from 'express';
import { updateAutomationSchema } from '@roult/shared';
import { AutomationsService } from './automations.service.js';
import { requireAuth } from '../../middleware/auth.js';
import { ValidationError } from '../../lib/errors.js';

export const automationsRouter: Router = Router();

// Un vendedor las LEE —tiene que saber por qué le aparecen tareas solas— pero no las cambia.
automationsRouter.get('/', requireAuth, async (req, res) => {
  res.json(await AutomationsService.list(req.user!));
});

automationsRouter.get('/runs', requireAuth, async (req, res) => {
  res.json(await AutomationsService.runs(req.user!));
});

automationsRouter.patch<{ code: string }>('/:code', requireAuth, async (req, res, next) => {
  try {
    const parsed = updateAutomationSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError('Datos inválidos');
    res.json(await AutomationsService.update(req.user!, req.params.code, parsed.data));
  } catch (err) {
    next(err);
  }
});
