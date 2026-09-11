import { Router } from 'express';
import { createCompanySchema, updateCompanySchema, companyFiltersSchema } from '@roult/shared';
import { CompaniesService } from './companies.service.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { paginationSchema } from '@roult/shared';
import { pageArgs, sendPaged } from '../../lib/pagination.js';
import { ValidationError } from '../../lib/errors.js';
import { toCsv, UTF8_BOM } from '../../lib/csv.js';
import { mergeCompanies, mergeCompaniesSchema } from './merge.js';

export const companiesRouter = Router();

companiesRouter.use(requireAuth);

companiesRouter.get('/', async (req, res, next) => {
  try {
    const parsed = companyFiltersSchema.safeParse(req.query);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    const page = paginationSchema.safeParse(req.query);
    if (!page.success) throw new ValidationError('Paginación inválida');
    sendPaged(res, await CompaniesService.listPaged(req.user!, parsed.data, pageArgs(page.data)));
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
      { key: 'representativeName', header: 'Representante' },
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

companiesRouter.post('/merge', async (req, res, next) => {
  try {
    const parsed = mergeCompaniesSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError('Elegí las dos fichas a fusionar');
    res.json(await mergeCompanies(req.user!, parsed.data));
  } catch (err) {
    next(err);
  }
});

companiesRouter.get('/options', async (req, res, next) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    res.json(await CompaniesService.options(req.user!, q));
  } catch (err) {
    next(err);
  }
});

companiesRouter.get<{ id: string }>('/:id', async (req, res, next) => {
  try {
    res.json(await CompaniesService.get(req.user!, req.params.id));
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
