import { Router, type Request } from 'express';
import { z } from 'zod';
import { relatedTypeSchema } from '@roult/shared';
import { WhatsAppService, verifyWebhook, handleWebhook } from './whatsapp.service.js';
import { requireAuth } from '../../middleware/auth.js';
import { ValidationError } from '../../lib/errors.js';
import { rateLimit } from '../../middleware/rateLimit.js';

export const whatsappRouter: Router = Router();

const connectSchema = z.object({
  phoneNumberId: z.string().min(5, 'Copiá el "Phone number ID" de Meta'),
  accessToken: z.string().min(20, 'El token de acceso es más largo que eso'),
  appSecret: z.string().optional(),
  displayPhone: z.string().optional(),
});

const sendSchema = z.object({
  relatedType: relatedTypeSchema,
  relatedId: z.string().min(1),
  to: z.string().min(6, 'Falta el número'),
  body: z.string().min(1, 'El mensaje no puede ir vacío').max(4000),
  /** Plantilla aprobada por Meta, para escribir primero o pasadas las 24h. */
  template: z.string().optional(),
});

whatsappRouter.get('/status', requireAuth, async (req, res) => {
  res.json(await WhatsAppService.status(req.user!));
});

whatsappRouter.post('/connect', requireAuth, async (req, res) => {
  const parsed = connectSchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(Object.values(parsed.error.flatten().fieldErrors).flat()[0] ?? 'Datos inválidos');
  res.json(await WhatsAppService.connect(req.user!, parsed.data));
});

whatsappRouter.delete('/connect', requireAuth, async (req, res) => {
  await WhatsAppService.disconnect(req.user!);
  res.status(204).end();
});

// Un mensaje sale hacia afuera y cuesta plata: el límite es contra un bucle en el código del
// cliente o una pestaña que dispara mil envíos, no contra la persona.
whatsappRouter.post('/send', requireAuth, rateLimit({ windowMs: 60_000, max: 30, message: 'Demasiados mensajes seguidos. Esperá un minuto.' }), async (req, res) => {
  const parsed = sendSchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(Object.values(parsed.error.flatten().fieldErrors).flat()[0] ?? 'Datos inválidos');
  const result = await WhatsAppService.send(req.user!, parsed.data);
  // 502 y no 500: el que falló fue Meta, y el mensaje de error va tal cual a la pantalla.
  if (!result.ok) return res.status(502).json({ error: result.error });
  res.json(result);
});

// ── Webhook de Meta ──────────────────────────────────────────────────────────
// Sin sesión: lo llama Meta. Se autentica con el token de verificación al darlo de alta y con la
// firma HMAC en cada mensaje.

whatsappRouter.get('/webhook', async (req, res) => {
  const challenge = await verifyWebhook(
    String(req.query['hub.mode'] ?? ''),
    String(req.query['hub.verify_token'] ?? ''),
    String(req.query['hub.challenge'] ?? '')
  );
  if (challenge === null) return res.status(403).send('Forbidden');
  res.type('text/plain').send(challenge);
});

whatsappRouter.post('/webhook', async (req, res) => {
  // Meta reintenta cualquier respuesta que no sea 200, así que se contesta 200 siempre y se
  // procesa igual: un error nuestro no tiene que convertirse en una tormenta de reintentos.
  try {
    const raw = (req as Request & { rawBody?: Buffer }).rawBody ?? JSON.stringify(req.body);
    const result = await handleWebhook(req.body, raw, req.header('x-hub-signature-256'));
    if (result.ignored > 0) console.warn('[whatsapp] webhook con eventos ignorados', result);
  } catch (err) {
    console.error('[whatsapp] webhook falló', err);
  }
  res.status(200).send('EVENT_RECEIVED');
});
