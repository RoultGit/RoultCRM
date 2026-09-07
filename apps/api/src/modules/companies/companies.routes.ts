import { Router } from 'express';
import { createCompanySchema, updateCompanySchema } from '@ventry/shared';
import { CompaniesService } from './companies.service.js';
import { requireAuth } from '../../middleware/auth.js';
import { ValidationError } from '../../lib/errors.js';

export const companiesRouter = Router();

companiesRouter.use(requireAuth);

companiesRouter.get('/', async (req, res, next) => {
  try {
    const companies = await CompaniesService.list(req.user!);
    res.json(companies);
  } catch (err) {
    next(err);
  }
});

companiesRouter.post('/', async (req, res, next) => {
  try {
    const parsed = createCompanySchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    const company = await CompaniesService.create(req.user!, parsed.data);
    res.status(201).json(company);
  } catch (err) {
    next(err);
  }
});

companiesRouter.patch('/:id', async (req, res, next) => {
  try {
    const parsed = updateCompanySchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    const company = await CompaniesService.update(req.user!, req.params.id, parsed.data);
    res.json(company);
  } catch (err) {
    next(err);
  }
});
