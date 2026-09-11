import { Router } from 'express';
import { EmailService, handleInbound, secretMatches } from './email.service.js';
import { requireAuth } from '../../middleware/auth.js';

export const emailRouter: Router = Router();

emailRouter.get('/inbox', requireAuth, async (req, res, next) => {
  try {
    res.json(await EmailService.status(req.user!));
  } catch (err) {
    next(err);
  }
});

emailRouter.post('/inbox', requireAuth, async (req, res, next) => {
  try {
    res.json(await EmailService.enable(req.user!));
  } catch (err) {
    next(err);
  }
});

emailRouter.delete('/inbox', requireAuth, async (req, res, next) => {
  try {
    res.json(await EmailService.disable(req.user!));
  } catch (err) {
    next(err);
  }
});

/**
 * Por acá entran los correos. Lo llama el proveedor de correo, no una persona.
 *
 * Sin sesión: la única puerta es INBOUND_SECRET. Sin el secreto configurado no atiende a nadie —
 * abierta, cualquiera podría inventar conversaciones dentro del CRM de un cliente.
 */
emailRouter.post('/inbound', async (req, res) => {
  if (!process.env.INBOUND_SECRET) {
    console.error('[correo] INBOUND_SECRET sin configurar: no se reciben correos.');
    return res.status(503).json({ error: 'Inbound not configured' });
  }
  if (!secretMatches(req.header('authorization'))) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Se contesta 200 pase lo que pase: los proveedores reintentan ante cualquier otra cosa, y un
  // error nuestro no tiene que volverse una tormenta de reintentos.
  try {
    const result = await handleInbound(req.body ?? {});
    if (!result.stored) console.warn('[correo] no se guardó:', result.reason);
    return res.json(result);
  } catch (err) {
    console.error('[correo] falló al procesar', err);
    return res.json({ stored: false, reason: 'error interno' });
  }
});
