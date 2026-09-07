import { Router } from 'express';
import { createDealSchema, updateDealSchema, setDealStageSchema, assignDealSchema } from '@ventry/shared';
import { DealsService } from './deals.service.js';
import { requireAuth } from '../../middleware/auth.js';
import { ValidationError } from '../../lib/errors.js';

export const dealsRouter = Router();

dealsRouter.use(requireAuth);

dealsRouter.get('/', async (req, res, next) => {
  try {
    res.json(await DealsService.list(req.user!));
  } catch (err) {
    next(err);
  }
});

dealsRouter.post('/', async (req, res, next) => {
  try {
    const parsed = createDealSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    res.status(201).json(await DealsService.create(req.user!, parsed.data));
  } catch (err) {
    next(err);
  }
});

dealsRouter.patch('/:id', async (req, res, next) => {
  try {
    const parsed = updateDealSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    res.json(await DealsService.update(req.user!, req.params.id, parsed.data));
  } catch (err) {
    next(err);
  }
});

dealsRouter.patch('/:id/stage', async (req, res, next) => {
  try {
    const parsed = setDealStageSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    res.json(await DealsService.setStage(req.user!, req.params.id, parsed.data));
  } catch (err) {
    next(err);
  }
});

dealsRouter.patch('/:id/assign', async (req, res, next) => {
  try {
    const parsed = assignDealSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    res.json(await DealsService.assign(req.user!, req.params.id, parsed.data.assignedUserId));
  } catch (err) {
    next(err);
  }
});
