import { Router } from 'express';
import {
  createLeadSchema,
  updateLeadSchema,
  setLeadStatusSchema,
  convertLeadSchema,
  leadFiltersSchema,
} from '@roult/shared';
import { LeadsService } from './leads.service.js';
import { requireAuth } from '../../middleware/auth.js';
import { paginationSchema } from '@roult/shared';
import { pageArgs, sendPaged } from '../../lib/pagination.js';
import { ValidationError } from '../../lib/errors.js';
import { toCsv, UTF8_BOM } from '../../lib/csv.js';
import { LeadsBulk, bulkAssignSchema, bulkStatusSchema } from './bulk.js';

export const leadsRouter = Router();

leadsRouter.use(requireAuth);

leadsRouter.get('/', async (req, res, next) => {
  try {
    const parsed = leadFiltersSchema.safeParse(req.query);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    const page = paginationSchema.safeParse(req.query);
    if (!page.success) throw new ValidationError('Paginación inválida');
    sendPaged(res, await LeadsService.listPaged(req.user!, parsed.data, pageArgs(page.data)));
  } catch (err) {
    next(err);
  }
});

// Acciones sobre varios a la vez. Van antes de las rutas con :id.
leadsRouter.post('/bulk/assign', async (req, res, next) => {
  try {
    const parsed = bulkAssignSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError('Selección inválida');
    res.json(await LeadsBulk.assign(req.user!, parsed.data));
  } catch (err) {
    next(err);
  }
});

leadsRouter.post('/bulk/status', async (req, res, next) => {
  try {
    const parsed = bulkStatusSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError('Selección inválida');
    res.json(await LeadsBulk.setStatus(req.user!, parsed.data));
  } catch (err) {
    next(err);
  }
});

// Va ANTES de las rutas con :id para que "/export" no se lea como un id.
leadsRouter.get('/export', async (req, res, next) => {
  try {
    const parsed = leadFiltersSchema.safeParse(req.query);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    const rows = await LeadsService.list(req.user!, parsed.data);
    const csv = toCsv(rows as unknown as Record<string, unknown>[], [
      { key: 'businessName', header: 'Empresa / persona' },
      { key: 'contactName', header: 'Contacto' },
      { key: 'representativeName', header: 'Representante' },
      { key: 'status', header: 'Estado' },
      { key: 'line', header: 'Línea' },
      { key: 'billingType', header: 'Cobro' },
      { key: 'source', header: 'Origen' },
      { key: 'email', header: 'Correo' },
      { key: 'phone', header: 'Teléfono' },
      { key: 'whatsapp', header: 'WhatsApp' },
      { key: 'createdAt', header: 'Creado' },
    ]);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="leads.csv"');
    res.send(UTF8_BOM + csv);
  } catch (err) {
    next(err);
  }
});

leadsRouter.post('/', async (req, res, next) => {
  try {
    const parsed = createLeadSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    const lead = await LeadsService.create(req.user!, parsed.data);
    res.status(201).json(lead);
  } catch (err) {
    next(err);
  }
});

leadsRouter.patch('/:id', async (req, res, next) => {
  try {
    const parsed = updateLeadSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    const lead = await LeadsService.update(req.user!, req.params.id, parsed.data);
    res.json(lead);
  } catch (err) {
    next(err);
  }
});

leadsRouter.patch('/:id/status', async (req, res, next) => {
  try {
    const parsed = setLeadStatusSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    const lead = await LeadsService.setStatus(req.user!, req.params.id, parsed.data.status);
    res.json(lead);
  } catch (err) {
    next(err);
  }
});

leadsRouter.post('/:id/convert', async (req, res, next) => {
  try {
    const parsed = convertLeadSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    const result = await LeadsService.convert(req.user!, req.params.id, parsed.data);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});
