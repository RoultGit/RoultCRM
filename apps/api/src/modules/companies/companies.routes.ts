import { Router } from 'express';
import { createCompanySchema, updateCompanySchema, companyFiltersSchema } from '@ventry/shared';
import { CompaniesService } from './companies.service.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { ValidationError } from '../../lib/errors.js';
import { toCsv, UTF8_BOM } from '../../lib/csv.js';

export const companiesRouter = Router();

companiesRouter.use(requireAuth);

companiesRouter.get('/', async (req, res, next) => {
  try {
    const parsed = companyFiltersSchema.safeParse(req.query);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    const companies = await CompaniesService.list(req.user!, parsed.data);
    res.json(companies);
  } catch (err) {
    next(err);
  }
});

// Va ANTES de las rutas con :id para que "/export" no se lea como un id.
companiesRouter.get('/export', async (req, res, next) => {
  try {
    const parsed = companyFiltersSchema.safeParse(req.query);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    const rows = await CompaniesService.list(req.user!, parsed.data);
    const csv = toCsv(rows as unknown as Record<string, unknown>[], [
      { key: 'name', header: 'Empresa' },
      { key: 'line', header: 'Línea' },
      { key: 'city', header: 'Ciudad' },
      { key: 'email', header: 'Correo' },
      { key: 'whatsapp', header: 'WhatsApp' },
      { key: 'source', header: 'Origen' },
      { key: 'createdAt', header: 'Creado' },
    ]);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="empresas.csv"');
    res.send(UTF8_BOM + csv);
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

// requireRole acá además del chequeo en el service: el rol se corta en el borde, antes de tocar la
// base, y el service igual lo revalida por si alguna vez se lo llama desde otro lado.
companiesRouter.delete<{ id: string }>('/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    res.json(await CompaniesService.remove(req.user!, req.params.id));
  } catch (err) {
    next(err);
  }
});
