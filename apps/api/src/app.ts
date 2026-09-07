import express, { type Express, type ErrorRequestHandler } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Prisma } from '@prisma/client';
import { authRouter } from './modules/auth/auth.routes.js';
import { usersRouter } from './modules/users/users.routes.js';
import { companiesRouter } from './modules/companies/companies.routes.js';
import { contactsRouter } from './modules/contacts/contacts.routes.js';
import { leadsRouter } from './modules/leads/leads.routes.js';
import { dealsRouter } from './modules/deals/deals.routes.js';
import { tasksRouter } from './modules/tasks/tasks.routes.js';
import { searchRouter } from './modules/search/search.routes.js';
import { auditRouter } from './modules/audit/audit.routes.js';
import { importRouter } from './modules/import/import.routes.js';
import { dashboardRouter } from './modules/dashboard/dashboard.routes.js';
import { AppError } from './lib/errors.js';

export function createApp(): Express {
  const app = express();
  // El frontend y la API comparten dominio en Vercel, así que lo normal es que el Origin del
  // request sea el propio host: eso se permite siempre y ninguna URL de preview necesita lista
  // blanca. WEB_ORIGIN queda para orígenes extra (un dominio propio, o el Vite local).
  const extraOrigins = (process.env.WEB_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.use(
    cors((req, callback) => {
      const origin = req.headers.origin;
      // Sin cabecera Origin (curl, health checks) no hay nada que bloquear.
      if (!origin) return callback(null, { origin: true, credentials: true });

      const sameOrigin = (() => {
        try {
          return new URL(origin).host === req.headers.host;
        } catch {
          return false;
        }
      })();

      callback(null, { origin: sameOrigin || extraOrigins.includes(origin), credentials: true });
    })
  );

  // Cabeceras de seguridad. La API devuelve JSON, así que la CSP restrictiva no molesta a nada; el
  // frontend lo sirve Vercel y tiene sus propias cabeceras en vercel.json.
  app.use(
    helmet({
      frameguard: { action: 'deny' },
      hsts: process.env.NODE_ENV === 'production' ? { maxAge: 31_536_000, includeSubDomains: true } : false,
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      referrerPolicy: { policy: 'no-referrer' },
    })
  );

  // El default de express.json son 100KB, pero el tope declarado de importación es de 1000 filas y
  // un archivo de contactos de ese tamaño pesa ~320KB.
  app.use(express.json({ limit: '5mb' }));
  app.use(cookieParser());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/auth', authRouter);
  app.use('/users', usersRouter);
  app.use('/companies', companiesRouter);
  app.use('/contacts', contactsRouter);
  app.use('/leads', leadsRouter);
  app.use('/deals', dealsRouter);
  app.use('/tasks', tasksRouter);
  app.use('/search', searchRouter);
  app.use('/audit', auditRouter);
  app.use('/import', importRouter);
  app.use('/dashboard', dashboardRouter);

  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    // body-parser tira este error fuera de la jerarquía de AppError, así que sin este caso caía en
    // el 500 genérico y el usuario no tenía forma de saber que el problema era el tamaño.
    if (err instanceof Error && 'type' in err && err.type === 'entity.too.large') {
      res.status(413).json({ error: 'El archivo es demasiado grande. Importá menos filas por vez.' });
      return;
    }
    // Prisma tira P2002 cuando se viola una restricción única. Sin este caso, dar de alta un
    // vendedor con un correo que ya existe devolvía "Internal server error": el admin no tenía forma
    // de saber que el problema era el correo repetido. Va acá y no en cada servicio para que cubra
    // cualquier restricción única que se agregue después.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const fields = Array.isArray(err.meta?.target) ? (err.meta.target as string[]).join(', ') : null;
      res.status(409).json({
        error: fields ? `Ya existe un registro con ese ${fields}.` : 'Ya existe un registro con esos datos.',
      });
      return;
    }
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.message, ...(err.details ? { details: err.details } : {}) });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  };
  app.use(errorHandler);

  return app;
}
