import { Router } from 'express';
import { z } from 'zod';
import { AuthService } from './auth.service.js';
import { ValidationError } from '../../lib/errors.js';
import { UsersService } from '../users/users.service.js';
import { requireAuth } from '../../middleware/auth.js';
import { changePasswordSchema, forgotPasswordSchema, resetWithTokenSchema } from '@roult/shared';
import { rateLimit } from '../../middleware/rateLimit.js';

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

// Sin esto, probar contraseñas contra /auth/login es gratis e ilimitado. Diez intentos por IP cada
// quince minutos deja trabajar a alguien que se equivoca de tecla y corta cualquier fuerza bruta.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Demasiados intentos de ingreso. Esperá unos minutos y probá de nuevo.',
});

authRouter.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError('Invalid email or password format');
    const { accessToken, refreshToken } = await AuthService.login(parsed.data.email, parsed.data.password);
    loginLimiter.reset(req);
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

// Mismo límite que el login: adivinar la contraseña actual a fuerza bruta desde una sesión robada
// es el mismo ataque, solo que por otra puerta.
const passwordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Demasiados intentos. Probá de nuevo en unos minutos.',
});

authRouter.patch('/password', requireAuth, passwordLimiter, async (req, res, next) => {
  try {
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    const tokens = await AuthService.changePassword(
      req.user!.userId,
      req.user!.tenantId,
      parsed.data.currentPassword,
      parsed.data.newPassword
    );
    // El par nuevo reemplaza al viejo en la misma respuesta: como se cortaron TODAS las sesiones,
    // sin esto el que acaba de cambiar su contraseña quedaría afuera de la app.
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, REFRESH_COOKIE_OPTS);
    passwordLimiter.reset(req);
    res.json({ accessToken: tokens.accessToken });
  } catch (err) {
    next(err);
  }
});

// Límite por IP, no por correo: sin esto cualquiera puede disparar cientos de correos a una casilla
// ajena usando este endpoint como cañón de spam. Y como la respuesta es siempre la misma, tampoco
// sirve para averiguar qué correos existen.
const forgotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Demasiados pedidos. Probá de nuevo en unos minutos.',
});

authRouter.post('/forgot-password', forgotLimiter, async (req, res, next) => {
  try {
    const parsed = forgotPasswordSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    await AuthService.forgotPassword(parsed.data.email);
    // SIEMPRE 200 con el mismo mensaje, exista o no la cuenta. Una respuesta distinta convertiría
    // este endpoint en una forma de averiguar quién usa el sistema.
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Limitador PROPIO, separado del de pedir el link. Con uno solo compartido, quien pedía cinco
// links se quedaba sin poder usar ninguno: pedir y usar son acciones distintas, y castigar la
// segunda por la primera deja a la persona encerrada afuera. Este es más permisivo porque acá el
// token ya es la credencial y adivinarlo es imposible por fuerza bruta.
const resetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Demasiados intentos. Probá de nuevo en unos minutos.',
});

authRouter.post('/reset-password', resetLimiter, async (req, res, next) => {
  try {
    const parsed = resetWithTokenSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    await AuthService.resetPasswordWithToken(parsed.data.token, parsed.data.newPassword);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
