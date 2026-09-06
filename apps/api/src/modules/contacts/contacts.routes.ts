import { Router } from 'express';
import { createContactSchema, updateContactSchema } from '@ventry/shared';
import { ContactsService } from './contacts.service.js';
import { requireAuth } from '../../middleware/auth.js';
import { ValidationError } from '../../lib/errors.js';

export const contactsRouter = Router();

contactsRouter.use(requireAuth);

contactsRouter.get('/', async (req, res, next) => {
  try {
    const contacts = await ContactsService.list(req.user!.tenantId);
    res.json(contacts);
  } catch (err) {
    next(err);
  }
});

contactsRouter.post('/', async (req, res, next) => {
  try {
    const parsed = createContactSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    const contact = await ContactsService.create(req.user!.tenantId, parsed.data);
    res.status(201).json(contact);
  } catch (err) {
    next(err);
  }
});

contactsRouter.patch('/:id', async (req, res, next) => {
  try {
    const parsed = updateContactSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    const contact = await ContactsService.update(req.user!.tenantId, req.params.id, parsed.data);
    res.json(contact);
  } catch (err) {
    next(err);
  }
});
