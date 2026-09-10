import { Router } from 'express';
import {
  createCustomFieldSchema,
  updateCustomFieldSchema,
  setCustomValuesSchema,
  activityFiltersSchema,
  relatedTypeSchema,
} from '@roult/shared';
import { z } from 'zod';
import { CustomFieldsService } from './customFields.service.js';
import { requireAuth } from '../../middleware/auth.js';
import { ValidationError } from '../../lib/errors.js';

export const customFieldsRouter = Router();

customFieldsRouter.use(requireAuth);

// La definición la LEE cualquiera —el vendedor necesita saber qué campos completar— pero solo el
// admin la cambia. Ese corte vive en el servicio.
customFieldsRouter.get('/', async (req, res, next) => {
  try {
    const parsed = z.object({ entity: relatedTypeSchema.optional() }).safeParse(req.query);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    res.json(await CustomFieldsService.list(req.user!, parsed.data.entity));
  } catch (err) {
    next(err);
  }
});

customFieldsRouter.post('/', async (req, res, next) => {
  try {
    const parsed = createCustomFieldSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    res.status(201).json(await CustomFieldsService.create(req.user!, parsed.data));
  } catch (err) {
    next(err);
  }
});

customFieldsRouter.patch<{ id: string }>('/:id', async (req, res, next) => {
  try {
    const parsed = updateCustomFieldSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    res.json(await CustomFieldsService.update(req.user!, req.params.id, parsed.data));
  } catch (err) {
    next(err);
  }
});

customFieldsRouter.get('/values', async (req, res, next) => {
  try {
    const parsed = activityFiltersSchema.safeParse({ relatedType: req.query.entity, relatedId: req.query.recordId });
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    res.json(await CustomFieldsService.getValues(req.user!, parsed.data.relatedType, parsed.data.relatedId));
  } catch (err) {
    next(err);
  }
});

customFieldsRouter.put('/values', async (req, res, next) => {
  try {
    const parsed = setCustomValuesSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    res.json(await CustomFieldsService.setValues(req.user!, parsed.data));
  } catch (err) {
    next(err);
  }
});
