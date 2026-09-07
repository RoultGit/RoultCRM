import { Router } from 'express';
import { z } from 'zod';
import { AuthService } from './auth.service.js';
import { ValidationError } from '../../lib/errors.js';
import { UsersService } from '../users/users.service.js';
import { requireAuth } from '../../middleware/auth.js';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const REFRESH_COOKIE = 'refreshToken';
const REFRESH_COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 30 * 24 * 60 * 60 * 1000,
};

export const authRouter = Router();

authRouter.post('/login', async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError('Invalid email or password format');
    const { accessToken, refreshToken } = await AuthService.login(parsed.data.email, parsed.data.password);
    res.cookie(REFRESH_COOKIE, refreshToken, REFRESH_COOKIE_OPTS);
    res.json({ accessToken });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/refresh', async (req, res, next) => {
  try {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (!token) throw new ValidationError('Missing refresh token');
    const { accessToken, refreshToken } = await AuthService.refresh(token);
    res.cookie(REFRESH_COOKIE, refreshToken, REFRESH_COOKIE_OPTS);
    res.json({ accessToken });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/logout', async (req, res, next) => {
  try {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (token) await AuthService.logout(token);
    res.clearCookie(REFRESH_COOKIE);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// requireAuth va en la ruta y no en el router entero: /login y /refresh tienen que seguir públicas.
authRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    res.json(await UsersService.me(req.user!));
  } catch (err) {
    next(err);
  }
});
