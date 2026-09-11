import { Router } from 'express';
import { z } from 'zod';
import { createQuoteSchema, updateQuoteSchema, respondQuoteSchema, quoteStatusSchema } from '@roult/shared';
import { QuotesService, PublicQuotes } from './quotes.service.js';
import { requireAuth } from '../../middleware/auth.js';
import { ValidationError } from '../../lib/errors.js';
import { rateLimit } from '../../middleware/rateLimit.js';

export const quotesRouter: Router = Router();

const primerError = (error: z.ZodError) =>
  Object.values(error.flatten().fieldErrors).flat()[0] ??
  error.flatten().formErrors[0] ??
  'Datos inválidos';

// ── Público: sin sesión, lo abre el cliente ──────────────────────────────────
// Va ANTES de las rutas con sesión para que /quotes/public no lo tome el :id de abajo.
//
// El límite es contra la fuerza bruta sobre el token: son 24 bytes al azar, pero una puerta sin
// sesión que además no cuesta nada probar es una invitación.

quotesRouter.get<{ token: string }>(
  '/public/:token',
  rateLimit({ windowMs: 60_000, max: 60, message: 'Demasiados intentos. Esperá un minuto.' }),
  async (req, res, next) => {
    try {
      res.json(await PublicQuotes.get(req.params.token));
    } catch (err) {
      next(err);
    }
  }
);

quotesRouter.post<{ token: string }>(
  '/public/:token/respond',
  rateLimit({ windowMs: 60_000, max: 20, message: 'Demasiados intentos. Esperá un minuto.' }),
  async (req, res, next) => {
    try {
      const parsed = respondQuoteSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(primerError(parsed.error));
      res.json(await PublicQuotes.respond(req.params.token, parsed.data));
    } catch (err) {
      next(err);
    }
  }
);

// ── Con sesión ───────────────────────────────────────────────────────────────

const filtersSchema = z.object({
  companyId: z.string().optional(),
  dealId: z.string().optional(),
  status: quoteStatusSchema.optional(),
});

quotesRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const parsed = filtersSchema.safeParse(req.query);
    if (!parsed.success) throw new ValidationError('Filtros inválidos');
    res.json(await QuotesService.list(req.user!, parsed.data));
  } catch (err) {
    next(err);
  }
});

quotesRouter.post('/', requireAuth, async (req, res, next) => {
  try {
    const parsed = createQuoteSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(primerError(parsed.error));
    res.status(201).json(await QuotesService.create(req.user!, parsed.data));
  } catch (err) {
    next(err);
  }
});

quotesRouter.get<{ id: string }>('/:id', requireAuth, async (req, res, next) => {
  try {
    res.json(await QuotesService.get(req.user!, req.params.id));
  } catch (err) {
    next(err);
  }
});

quotesRouter.patch<{ id: string }>('/:id', requireAuth, async (req, res, next) => {
  try {
    const parsed = updateQuoteSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(primerError(parsed.error));
    res.json(await QuotesService.update(req.user!, req.params.id, parsed.data));
  } catch (err) {
    next(err);
  }
});

quotesRouter.post<{ id: string }>('/:id/send', requireAuth, async (req, res, next) => {
  try {
    res.json(await QuotesService.send(req.user!, req.params.id));
  } catch (err) {
    next(err);
  }
});

quotesRouter.delete<{ id: string }>('/:id', requireAuth, async (req, res, next) => {
  try {
    await QuotesService.remove(req.user!, req.params.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
