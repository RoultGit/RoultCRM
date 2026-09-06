import { Router } from 'express';
import { createLeadSchema, updateLeadSchema, setLeadStatusSchema, convertLeadSchema } from '@ventry/shared';
import { LeadsService } from './leads.service.js';
import { requireAuth } from '../../middleware/auth.js';
import { ValidationError } from '../../lib/errors.js';

export const leadsRouter = Router();

leadsRouter.use(requireAuth);

leadsRouter.get('/', async (req, res, next) => {
  try {
    const leads = await LeadsService.list(req.user!.tenantId);
    res.json(leads);
  } catch (err) {
    next(err);
  }
});

leadsRouter.post('/', async (req, res, next) => {
  try {
    const parsed = createLeadSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    const lead = await LeadsService.create(req.user!.tenantId, parsed.data);
    res.status(201).json(lead);
  } catch (err) {
    next(err);
  }
});

leadsRouter.patch('/:id', async (req, res, next) => {
  try {
    const parsed = updateLeadSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    const lead = await LeadsService.update(req.user!.tenantId, req.params.id, parsed.data);
    res.json(lead);
  } catch (err) {
    next(err);
  }
});

leadsRouter.patch('/:id/status', async (req, res, next) => {
  try {
    const parsed = setLeadStatusSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    const lead = await LeadsService.setStatus(req.user!.tenantId, req.params.id, parsed.data.status);
    res.json(lead);
  } catch (err) {
    next(err);
  }
});

leadsRouter.post('/:id/convert', async (req, res, next) => {
  try {
    const parsed = convertLeadSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    const result = await LeadsService.convert(req.user!.tenantId, req.params.id, parsed.data.confirmDuplicate ?? false);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});
