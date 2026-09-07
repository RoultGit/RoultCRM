import { Router } from 'express';
import { SearchService } from './search.service.js';
import { requireAuth } from '../../middleware/auth.js';

export const searchRouter = Router();

searchRouter.use(requireAuth);

searchRouter.get('/', async (req, res, next) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    res.json({ results: await SearchService.search(req.user!, q) });
  } catch (err) {
    next(err);
  }
});
