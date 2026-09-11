import { Router } from 'express';
import { listErrors } from '../../lib/errorLog.js';
import { requireAuth } from '../../middleware/auth.js';
import { ForbiddenError } from '../../lib/errors.js';

export const healthRouter: Router = Router();
healthRouter.use(requireAuth);

/**
 * Los últimos errores del servidor.
 *
 * Solo para el dueño de la plataforma: adentro hay rutas, mensajes y trazas de TODAS las empresas
 * cliente. Un administrador de una empresa no tiene por qué ver los errores de otra.
 */
healthRouter.get('/errors', async (req, res, next) => {
  try {
    if (!req.user!.isPlatformOwner) throw new ForbiddenError('Solo el dueño de la plataforma');
    res.json(await listErrors(100));
  } catch (err) {
    next(err);
  }
});
