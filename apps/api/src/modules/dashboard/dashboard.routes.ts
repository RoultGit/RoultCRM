import { Router } from 'express';
import { chartRangeSchema } from '@roult/shared';
import { DashboardService } from './dashboard.service.js';
import { ChartsService } from './charts.service.js';
import { requireAuth } from '../../middleware/auth.js';
import { ValidationError } from '../../lib/errors.js';

export const dashboardRouter = Router();

dashboardRouter.use(requireAuth);

// Sin requireRole: el spec pide una vista para admin y otra para vendedor, y el scoping por dueño ya
// hace que cada uno vea los suyos. Es el mismo endpoint con distinto alcance, no dos endpoints.
dashboardRouter.get('/', async (req, res, next) => {
  try {
    res.json(await DashboardService.summary(req.user!));
  } catch (err) {
    next(err);
  }
});

// Separado del resumen: las tarjetas de arriba se piden en cada visita y son baratas; las series de
// los gráficos leen varios meses de deals y cambian de forma según el rango que elija el usuario.
dashboardRouter.get('/charts', async (req, res, next) => {
  try {
    const parsed = chartRangeSchema.safeParse(req.query);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    res.json(await ChartsService.charts(req.user!, parsed.data.months));
  } catch (err) {
    next(err);
  }
});
