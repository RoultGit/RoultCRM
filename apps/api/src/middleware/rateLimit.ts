import type { RequestHandler } from "express";

// ponytail: contador en memoria, no Redis. Alcanza para un solo proceso, que es como se va a
// desplegar esto; el día que haya más de una instancia detrás de un balanceador, cada una contará
// por su lado y hay que mover esto a un almacén compartido.
interface Attempt {
  count: number;
  resetAt: number;
}

export interface RateLimiter extends RequestHandler {
  /** Borra el contador de quien hizo este request. Se llama cuando el intento salió bien. */
  reset(req: { ip?: string }): void;
}

export function rateLimit({
  windowMs,
  max,
  message,
}: {
  windowMs: number;
  max: number;
  message: string;
}): RateLimiter {
  const attempts = new Map<string, Attempt>();

  const handler: RequestHandler = (req, res, next) => {
    const now = Date.now();
    const key = req.ip ?? "desconocido";

    // Limpieza oportunista: sin esto el Map crece con cada IP que pasó alguna vez.
    if (attempts.size > 10_000) {
      for (const [k, v] of attempts) if (v.resetAt <= now) attempts.delete(k);
    }

    const current = attempts.get(key);
    if (!current || current.resetAt <= now) {
      attempts.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    current.count += 1;
    if (current.count > max) {
      res.setHeader("Retry-After", Math.ceil((current.resetAt - now) / 1000));
      res.status(429).json({ error: message });
      return;
    }
    next();
  };

  return Object.assign(handler, {
    // Un ingreso exitoso limpia la cuenta: lo que interesa limitar son los intentos fallidos, y
    // penalizar a alguien que entra bien todos los días sería castigar el uso normal.
    reset(req: { ip?: string }) {
      attempts.delete(req.ip ?? "desconocido");
    },
  });
}
