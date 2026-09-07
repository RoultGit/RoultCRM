import { Router } from 'express';
import { calendarRangeSchema } from '@ventry/shared';
import { CalendarService } from './calendar.service.js';
import { requireAuth } from '../../middleware/auth.js';
import { ValidationError } from '../../lib/errors.js';

export const calendarRouter = Router();

calendarRouter.use(requireAuth);

calendarRouter.get('/', async (req, res, next) => {
  try {
    const parsed = calendarRangeSchema.safeParse(req.query);
    // El rango es obligatorio: sin él habría que devolver todos los eventos de la historia del
    // tenant para que el cliente descarte el 99%.
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    res.json(await CalendarService.range(req.user!, parsed.data.from, parsed.data.to));
  } catch (err) {
    next(err);
  }
});
