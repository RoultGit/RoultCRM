import { z } from 'zod';

/**
 * Cuántas filas devuelve una lista y desde dónde.
 *
 * El tope duro existe porque sin él una sola petición puede pedir la tabla entera de un cliente con
 * años de historia: son megabytes por carga de pantalla y el teléfono de un vendedor en la calle no
 * los baja. El total va aparte, en la cabecera X-Total-Count, para no cambiarle la forma a la
 * respuesta de todas las listas que ya existen.
 */
export const MAX_PAGE_SIZE = 200;
export const DEFAULT_PAGE_SIZE = 50;

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export type Pagination = z.infer<typeof paginationSchema>;

export const TOTAL_HEADER = 'X-Total-Count';
