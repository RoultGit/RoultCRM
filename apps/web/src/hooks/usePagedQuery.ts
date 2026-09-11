import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { DEFAULT_PAGE_SIZE, TOTAL_HEADER } from '@roult/shared';
import { apiClient } from '../lib/api.js';

export interface Page {
  limit: number;
  offset: number;
}

export interface PagedResult<T> {
  items: T[];
  total: number;
}

export const firstPage: Page = { limit: DEFAULT_PAGE_SIZE, offset: 0 };

/**
 * Una lista paginada.
 *
 * El total viaja en la cabecera y no en el cuerpo, así que se lee acá y se devuelve junto a las
 * filas: sin el total no se puede decir "50 de 312" ni saber si queda otra página.
 */
export function usePagedQuery<T>(
  key: unknown[],
  path: string,
  params: Record<string, unknown>,
  page: Page,
  options?: Partial<UseQueryOptions<PagedResult<T>>>
) {
  return useQuery<PagedResult<T>>({
    // La página y los filtros van en la llave: con una llave fija, la página 2 pisaría a la 1 en
    // la caché y la pantalla mostraría filas que no pidió.
    queryKey: [...key, params, page],
    queryFn: async () => {
      const res = await apiClient.get<T[]>(path, {
        params: { ...params, limit: page.limit, offset: page.offset },
      });
      const total = Number(res.headers[TOTAL_HEADER.toLowerCase()] ?? res.data.length);
      return { items: res.data, total: Number.isFinite(total) ? total : res.data.length };
    },
    ...options,
  });
}
