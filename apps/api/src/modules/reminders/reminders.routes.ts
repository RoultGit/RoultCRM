import { Router } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { runReminders, buildDigests } from './reminders.service.js';
import { requireAuth } from '../../middleware/auth.js';
import { isMailConfigured } from '../../lib/mailer.js';
import { prisma } from '../../lib/prisma.js';

export const remindersRouter: Router = Router();

/**
 * El disparador del resumen diario. Lo llama el cron de Vercel, no una persona.
 *
 * No pasa por el middleware de sesión: el cron no tiene usuario. La única puerta es CRON_SECRET, y
 * sin el secreto configurado la ruta no atiende a nadie — abierta sería un botón para mandarle
 * correo a todos los usuarios del sistema desde afuera.
 */
remindersRouter.get('/reminders', async (req, res) => {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.error('[cron] CRON_SECRET sin configurar: el resumen diario no corre.');
    return res.status(503).json({ error: 'Cron not configured' });
  }

  const header = req.header('authorization') ?? '';
  const given = header.startsWith('Bearer ') ? header.slice(7) : '';
  // timingSafeEqual pide buffers del mismo largo, así que el largo se compara antes. La diferencia
  // de largo no es secreto; el contenido sí.
  const ok =
    given.length === expected.length &&
    timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  if (!ok) return res.status(401).json({ error: 'Unauthorized' });

  const result = await runReminders();
  console.info('[cron] resumen diario', result);
  return res.json(result);
});


/**
 * Qué le llegaría HOY a quien pregunta, sin mandar nada.
 *
 * Es la única forma de que un admin sepa si los recordatorios funcionan antes de esperar hasta
 * mañana a las 8. No manda correo a propósito: un botón de "probar" que le escribe a todo el equipo
 * es un botón que nadie aprieta dos veces.
 */
remindersRouter.get('/mine', requireAuth, async (req, res) => {
  const actor = req.user!;
  // Con `true` incluye a quien ya recibió el correo hoy: es una vista previa, no un envío.
  const digests = await buildDigests(new Date(), true);
  const mio = digests.find((d) => d.userId === actor.userId);
  const yaEnviado = await prisma.user.findUnique({
    where: { id: actor.userId },
    select: { lastDigestAt: true },
  });
  res.json({
    mailConfigured: isMailConfigured(),
    lastDigestAt: yaEnviado?.lastDigestAt?.toISOString() ?? null,
    items: (mio?.items ?? []).map((i) => ({
      kind: i.kind,
      title: i.title,
      subtitle: i.subtitle ?? null,
      dueDate: i.dueDate.toISOString(),
    })),
  });
});
