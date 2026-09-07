import { Router } from 'express';
import { DashboardService } from './dashboard.service.js';
import { requireAuth } from '../../middleware/auth.js';

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
