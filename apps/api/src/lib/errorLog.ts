import type { Request } from 'express';
import { prisma } from './prisma.js';

/**
 * Guarda un error del servidor para poder enterarse sin que llame un cliente.
 *
 * NUNCA lanza: si falla el registro del error, lo último que puede hacer es romper la respuesta de
 * error que estaba dando.
 */
export async function recordError(req: Request, status: number, err: unknown): Promise<void> {
  // Solo lo que es culpa nuestra. Un 400 o un 404 son respuestas correctas del sistema y llenarían
  // el registro de ruido que tapa lo que sí importa.
  if (status < 500) return;
  try {
    const actor = (req as Request & { user?: { tenantId?: string; userId?: string } }).user;
    await prisma.errorLog.create({
      data: {
        tenantId: actor?.tenantId ?? null,
        userId: actor?.userId ?? null,
        method: req.method,
        // Sin la query: ahí viajan filtros y a veces datos del cliente, y esto lo lee alguien que
        // no es de esa empresa.
        path: req.path.slice(0, 500),
        status,
        message: (err instanceof Error ? err.message : String(err)).slice(0, 1000),
        stack: err instanceof Error ? (err.stack ?? '').slice(0, 4000) : null,
      },
    });
  } catch (fallo) {
    console.error('[errorLog] no se pudo registrar el error', fallo);
  }
}

export interface ErrorLogDTO {
  id: string;
  tenantId: string | null;
  userId: string | null;
  method: string;
  path: string;
  status: number;
  message: string;
  stack: string | null;
  createdAt: string;
}

/** Los últimos errores. Es del dueño de la plataforma: hay rastros de varias empresas adentro. */
export async function listErrors(limit = 100): Promise<ErrorLogDTO[]> {
  const filas = await prisma.errorLog.findMany({ orderBy: { createdAt: 'desc' }, take: Math.min(limit, 200) });
  return filas.map((f) => ({
    id: f.id,
    tenantId: f.tenantId,
    userId: f.userId,
    method: f.method,
    path: f.path,
    status: f.status,
    message: f.message,
    stack: f.stack,
    createdAt: f.createdAt.toISOString(),
  }));
}

/** Se borran los viejos en la pasada diaria: un registro que crece para siempre es una factura. */
export async function pruneErrors(dias = 30): Promise<number> {
  const limite = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
  const { count } = await prisma.errorLog.deleteMany({ where: { createdAt: { lt: limite } } });
  return count;
}
