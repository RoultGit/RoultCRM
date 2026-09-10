import { Router } from 'express';
import { z } from 'zod';
import { createLeadSchema } from '@roult/shared';
import { IntakeService } from './intake.service.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { ValidationError, UnauthorizedError } from '../../lib/errors.js';
import { rateLimit } from '../../middleware/rateLimit.js';

export const intakeRouter = Router();

// ── Administrar claves: con sesión, y solo ADMIN ─────────────────────────────
// Una clave de API abre la puerta de entrada de la empresa: no es algo que un vendedor deba crear.
intakeRouter.get('/keys', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    res.json(await IntakeService.listKeys(req.user!));
  } catch (err) {
    next(err);
  }
});

intakeRouter.post('/keys', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const parsed = z.object({ name: z.string().min(1, 'Ponele un nombre') }).safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    res.status(201).json(await IntakeService.createKey(req.user!, parsed.data.name));
  } catch (err) {
    next(err);
  }
});

intakeRouter.delete<{ id: string }>('/keys/:id', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    await IntakeService.revokeKey(req.user!, req.params.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// ── La puerta de entrada: SIN sesión, con clave ──────────────────────────────
// Límite alto pero existente: un formulario legítimo manda unos pocos leads por hora, y sin tope
// alguien con la clave filtrada podría llenar la base de basura en minutos.
const intakeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: 'Demasiados envíos. Probá de nuevo en un minuto.',
});

intakeRouter.post('/leads', intakeLimiter, async (req, res, next) => {
  try {
    // La clave va en una cabecera y NO en la URL: las URLs quedan en los logs del servidor, en el
    // historial del navegador y en el Referer que se manda al siguiente sitio.
    const key = req.header('X-API-Key');
    if (!key) throw new UnauthorizedError('Falta la cabecera X-API-Key');

    const parsed = createLeadSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    res.status(201).json(await IntakeService.captureLead(key, parsed.data));
  } catch (err) {
    next(err);
  }
});
