import { Router } from 'express';
import { importPreviewSchema, importCommitSchema, importableEntitySchema } from '@roult/shared';
import { ImportService } from './import.service.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { ValidationError } from '../../lib/errors.js';

export const importRouter = Router();

// Importar crea registros en masa para todo el tenant, incluidos los de otros vendedores. Es
// trabajo de migración, no de venta diaria.
importRouter.use(requireAuth, requireRole('ADMIN'));

importRouter.post('/:entity/preview', async (req, res, next) => {
  try {
    const entity = importableEntitySchema.safeParse(req.params.entity);
    if (!entity.success) throw new ValidationError('Entidad no importable');
    const body = importPreviewSchema.safeParse(req.body);
    if (!body.success) throw new ValidationError(body.error.message);
    res.json(await ImportService.preview(req.user!, entity.data, body.data.rows));
  } catch (err) {
    next(err);
  }
});

importRouter.post('/:entity/commit', async (req, res, next) => {
  try {
    const entity = importableEntitySchema.safeParse(req.params.entity);
    if (!entity.success) throw new ValidationError('Entidad no importable');
    const body = importCommitSchema.safeParse(req.body);
    if (!body.success) throw new ValidationError(body.error.message);
    res.status(201).json(await ImportService.commit(req.user!, entity.data, body.data.rows, body.data.skipIndexes));
  } catch (err) {
    next(err);
  }
});
