import { Router } from 'express';
import { createContactSchema, updateContactSchema } from '@roult/shared';
import { ContactsService } from './contacts.service.js';
import { requireAuth } from '../../middleware/auth.js';
import { ValidationError } from '../../lib/errors.js';
import { paginationSchema } from '@roult/shared';
import { pageArgs, sendPaged } from '../../lib/pagination.js';

export const contactsRouter = Router();

contactsRouter.use(requireAuth);

contactsRouter.get('/', async (req, res, next) => {
  try {
    const page = paginationSchema.safeParse(req.query);
    if (!page.success) throw new ValidationError('Paginación inválida');
    const companyId = typeof req.query.companyId === 'string' ? req.query.companyId : undefined;
    sendPaged(res, await ContactsService.listPaged(req.user!, pageArgs(page.data), companyId));
  } catch (err) {
    next(err);
  }
});

contactsRouter.post('/', async (req, res, next) => {
  try {
    const parsed = createContactSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    const contact = await ContactsService.create(req.user!, parsed.data);
    res.status(201).json(contact);
  } catch (err) {
    next(err);
  }
});

contactsRouter.patch('/:id', async (req, res, next) => {
  try {
    const parsed = updateContactSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    const contact = await ContactsService.update(req.user!, req.params.id, parsed.data);
    res.json(contact);
  } catch (err) {
    next(err);
  }
});
