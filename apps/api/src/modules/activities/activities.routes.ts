import { Router } from 'express';
import { createActivitySchema, activityFiltersSchema } from '@roult/shared';
import { ActivitiesService } from './activities.service.js';
import { requireAuth } from '../../middleware/auth.js';
import { ValidationError } from '../../lib/errors.js';

export const activitiesRouter = Router();

activitiesRouter.use(requireAuth);

activitiesRouter.get('/', async (req, res, next) => {
  try {
    const parsed = activityFiltersSchema.safeParse(req.query);
    // El registro relacionado es obligatorio: sin él habría que devolver la historia completa del
    // tenant, que no es lo que ninguna pantalla necesita.
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    res.json(await ActivitiesService.list(req.user!, parsed.data.relatedType, parsed.data.relatedId));
  } catch (err) {
    next(err);
  }
});

activitiesRouter.post('/', async (req, res, next) => {
  try {
    const parsed = createActivitySchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    res.status(201).json(await ActivitiesService.create(req.user!, parsed.data));
  } catch (err) {
    next(err);
  }
});
