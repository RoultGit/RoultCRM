import { Router } from 'express';
import { z } from 'zod';
import {
  createInstallmentSchema,
  updateInstallmentSchema,
  payInstallmentSchema,
  generatePlanSchema,
} from '@roult/shared';
import { InstallmentsService } from './installments.service.js';
import { requireAuth } from '../../middleware/auth.js';
import { ValidationError } from '../../lib/errors.js';

export const installmentsRouter: Router = Router();

const primerError = (error: z.ZodError) =>
  Object.values(error.flatten().fieldErrors).flat()[0] ??
  error.flatten().formErrors[0] ??
  'Datos inválidos';

const filtersSchema = z.object({
  dealId: z.string().optional(),
  companyId: z.string().optional(),
  status: z.enum(['pending', 'overdue', 'paid']).optional(),
});

installmentsRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const parsed = filtersSchema.safeParse(req.query);
    if (!parsed.success) throw new ValidationError('Filtros inválidos');
    res.json(await InstallmentsService.list(req.user!, parsed.data));
  } catch (err) {
    next(err);
  }
});

// Va antes de /:id para que "totals" no lo tome como un id.
installmentsRouter.get('/totals', requireAuth, async (req, res, next) => {
  try {
    res.json(await InstallmentsService.totals(req.user!));
  } catch (err) {
    next(err);
  }
});

installmentsRouter.post('/generate', requireAuth, async (req, res, next) => {
  try {
    const parsed = generatePlanSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(primerError(parsed.error));
    res.status(201).json(await InstallmentsService.generate(req.user!, parsed.data));
  } catch (err) {
    next(err);
  }
});

installmentsRouter.post('/', requireAuth, async (req, res, next) => {
  try {
    const parsed = createInstallmentSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(primerError(parsed.error));
    res.status(201).json(await InstallmentsService.create(req.user!, parsed.data));
  } catch (err) {
    next(err);
  }
});

installmentsRouter.patch<{ id: string }>('/:id', requireAuth, async (req, res, next) => {
  try {
    const parsed = updateInstallmentSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(primerError(parsed.error));
    res.json(await InstallmentsService.update(req.user!, req.params.id, parsed.data));
  } catch (err) {
    next(err);
  }
});

installmentsRouter.post<{ id: string }>('/:id/pay', requireAuth, async (req, res, next) => {
  try {
    const parsed = payInstallmentSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(primerError(parsed.error));
    res.json(await InstallmentsService.pay(req.user!, req.params.id, parsed.data));
  } catch (err) {
    next(err);
  }
});

installmentsRouter.post<{ id: string }>('/:id/unpay', requireAuth, async (req, res, next) => {
  try {
    res.json(await InstallmentsService.unpay(req.user!, req.params.id));
  } catch (err) {
    next(err);
  }
});

installmentsRouter.delete<{ id: string }>('/:id', requireAuth, async (req, res, next) => {
  try {
    await InstallmentsService.remove(req.user!, req.params.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
