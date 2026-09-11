import type { Response } from 'express';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, TOTAL_HEADER, type Pagination } from '@roult/shared';

export interface PageArgs {
  take: number;
  skip: number;
}

/** Traduce lo que pidió el cliente a los argumentos de Prisma, con el tope aplicado siempre. */
export function pageArgs(pagination: Pagination = {}): PageArgs {
  return {
    take: Math.min(pagination.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    skip: pagination.offset ?? 0,
  };
}

export interface Paged<T> {
  items: T[];
  total: number;
}

/**
 * Devuelve la página y pone el total en la cabecera.
 *
 * El total va en cabecera y no en el cuerpo para que las listas sigan devolviendo un arreglo: si
 * cambiara a `{ items, total }` habría que tocar todos los consumidores de una vez, y un refactor
 * así se rompe en el lugar que uno se olvidó de mirar.
 */
export function sendPaged<T>(res: Response, paged: Paged<T>): void {
  res.setHeader(TOTAL_HEADER, String(paged.total));
  // Sin esto el navegador no puede leer la cabecera: en una respuesta con CORS solo se exponen
  // unas pocas por defecto, y esta no es una de ellas.
  res.setHeader('Access-Control-Expose-Headers', TOTAL_HEADER);
  res.json(paged.items);
}
