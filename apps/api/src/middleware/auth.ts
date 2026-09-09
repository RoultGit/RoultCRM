import type { RequestHandler } from 'express';
import { verifyAccessToken, type AccessTokenPayload } from '../lib/tokens.js';
import { UnauthorizedError, ForbiddenError } from '../lib/errors.js';

declare global {
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
    }
  }
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next(new UnauthorizedError('Missing bearer token'));
    return;
  }
  try {
    req.user = verifyAccessToken(header.slice('Bearer '.length));
    next();
  } catch {
    next(new UnauthorizedError('Invalid or expired token'));
  }
};

export function requireRole(...roles: AccessTokenPayload['role'][]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      next(new ForbiddenError('Insufficient role'));
      return;
    }
    next();
  };
}

// Crear entidades cruza la frontera del tenant, que es la línea que TODO el resto del sistema
// respeta. Por eso no alcanza con ser ADMIN: el admin de una empresa cliente no puede dar de alta
// otras empresas ni enterarse de que existen.
export const requirePlatformOwner: RequestHandler = (req, _res, next) => {
  if (!req.user?.isPlatformOwner) {
    next(new ForbiddenError('Solo el dueño de la plataforma puede administrar entidades'));
    return;
  }
  next();
};
