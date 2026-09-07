import express, { type Express, type ErrorRequestHandler } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
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
  app.use(cors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173', credentials: true }));
  // El default de express.json son 100KB, pero el tope declarado de importación es de 1000 filas y
  // un archivo de contactos de ese tamaño pesa ~320KB. Con el default, usar la función tal como está
  // documentada devolvía un 500 genérico sin decir que el archivo era grande.
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
