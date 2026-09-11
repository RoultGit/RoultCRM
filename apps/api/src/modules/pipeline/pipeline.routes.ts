import { Router } from 'express';
import { updatePipelineStageSchema } from '@roult/shared';
import { PipelineService } from './pipeline.service.js';
import { requireAuth } from '../../middleware/auth.js';
import { ValidationError } from '../../lib/errors.js';

export const pipelineRouter: Router = Router();
pipelineRouter.use(requireAuth);

// Un vendedor las LEE —son los nombres que ve en su tablero— pero no las cambia.
pipelineRouter.get('/stages', async (req, res, next) => {
  try {
    res.json(await PipelineService.list(req.user!));
  } catch (err) {
    next(err);
  }
});

pipelineRouter.patch<{ stage: string }>('/stages/:stage', async (req, res, next) => {
  try {
    const parsed = updatePipelineStageSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError('Datos inválidos');
    res.json(await PipelineService.update(req.user!, req.params.stage, parsed.data));
  } catch (err) {
    next(err);
  }
});
