import { Router } from 'express';
import {
  createDealSchema,
  updateDealSchema,
  setDealStageSchema,
  assignDealSchema,
  dealFiltersSchema,
} from '@ventry/shared';
import { DealsService } from './deals.service.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { ValidationError } from '../../lib/errors.js';
import { toCsv, UTF8_BOM } from '../../lib/csv.js';

export const dealsRouter = Router();

dealsRouter.use(requireAuth);

dealsRouter.get('/', async (req, res, next) => {
  try {
    const parsed = dealFiltersSchema.safeParse(req.query);
    // Un filtro con un valor inválido tiene que ser un error, no un filtro ignorado: silenciarlo
    // devolvería la lista completa y el usuario creería que ese es el resultado del filtro.
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    res.json(await DealsService.list(req.user!, parsed.data));
  } catch (err) {
    next(err);
  }
});

// Va ANTES de las rutas con :id para que "/export" no se lea como un id.
dealsRouter.get('/export', async (req, res, next) => {
  try {
    const parsed = dealFiltersSchema.safeParse(req.query);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    const rows = await DealsService.list(req.user!, parsed.data);
    const csv = toCsv(rows as unknown as Record<string, unknown>[], [
      { key: 'companyName', header: 'Empresa' },
      { key: 'title', header: 'Deal' },
      { key: 'amount', header: 'Monto' },
      { key: 'currency', header: 'Moneda' },
      { key: 'stage', header: 'Etapa' },
      { key: 'lostReason', header: 'Motivo de pérdida' },
      { key: 'nextStepDescription', header: 'Próximo paso' },
      { key: 'nextStepDate', header: 'Fecha próximo paso' },
      { key: 'createdAt', header: 'Creado' },
    ]);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="deals.csv"');
    res.send(UTF8_BOM + csv);
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

// requireRole acá además del chequeo en el service: el rol se corta en el borde, antes de tocar la
// base, y el service igual lo revalida por si alguna vez se lo llama desde otro lado.
dealsRouter.delete<{ id: string }>('/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    await DealsService.remove(req.user!, req.params.id);
    res.status(204).end();
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
