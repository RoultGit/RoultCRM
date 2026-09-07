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
import { AppError } from './lib/errors.js';

export function createApp(): Express {
  const app = express();
  app.use(cors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173', credentials: true }));
  app.use(express.json());
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

  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
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
