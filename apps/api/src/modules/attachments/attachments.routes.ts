import { Router } from 'express';
import { z } from 'zod';
import { relatedTypeSchema } from '@roult/shared';
import { AttachmentsService } from './attachments.service.js';
import { requireAuth } from '../../middleware/auth.js';
import { ValidationError } from '../../lib/errors.js';
import { rateLimit } from '../../middleware/rateLimit.js';

export const attachmentsRouter: Router = Router();
attachmentsRouter.use(requireAuth);

const listSchema = z.object({ relatedType: relatedTypeSchema, relatedId: z.string().min(1) });

const uploadSchema = z.object({
  relatedType: relatedTypeSchema,
  relatedId: z.string().min(1),
  name: z.string().min(1).max(300),
  size: z.number().int().positive(),
  mimeType: z.string().min(1).max(200),
});

attachmentsRouter.get('/', async (req, res, next) => {
  try {
    const parsed = listSchema.safeParse(req.query);
    if (!parsed.success) throw new ValidationError('Faltan relatedType y relatedId');
    res.json(await AttachmentsService.list(req.user!, parsed.data.relatedType, parsed.data.relatedId));
  } catch (err) {
    next(err);
  }
});

// Cada pedido reserva una fila y firma una URL: sin límite, un bucle en el navegador de alguien
// llena la tabla de filas a medio subir.
attachmentsRouter.post(
  '/upload-url',
  rateLimit({ windowMs: 60_000, max: 30, message: 'Demasiadas subidas seguidas. Esperá un minuto.' }),
  async (req, res, next) => {
    try {
      const parsed = uploadSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError('Datos del archivo inválidos');
      res.status(201).json(await AttachmentsService.requestUpload(req.user!, parsed.data));
    } catch (err) {
      next(err);
    }
  }
);

attachmentsRouter.post<{ id: string }>('/:id/confirm', async (req, res, next) => {
  try {
    res.json(await AttachmentsService.confirmUpload(req.user!, req.params.id));
  } catch (err) {
    next(err);
  }
});

attachmentsRouter.delete<{ id: string }>('/:id', async (req, res, next) => {
  try {
    await AttachmentsService.remove(req.user!, req.params.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
