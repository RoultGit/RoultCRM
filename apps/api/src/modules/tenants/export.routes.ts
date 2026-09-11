import { Router } from 'express';
import { exportTenantData } from './export.js';
import { requireAuth } from '../../middleware/auth.js';

export const exportRouter: Router = Router();

/**
 * Todos los datos de MI empresa, para descargar.
 *
 * Va en su propio router y no en el de entidades porque ese exige ser dueño de la plataforma: acá
 * cada administrador se lleva lo suyo, no lo de otros. El alcance sale del token, nunca de la URL.
 */
exportRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const datos = await exportTenantData(req.user!);
    const fecha = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="roultcrm-${fecha}.json"`);
    res.send(JSON.stringify(datos, null, 2));
  } catch (err) {
    next(err);
  }
});
