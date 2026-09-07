import { useQuery } from '@tanstack/react-query';
import type { SearchResponseDTO } from '@roult/shared';
import { apiClient } from '../lib/api.js';

export function useSearch(query: string) {
  const q = query.trim();
  return useQuery({
    queryKey: ['search', q],
    // `enabled` evita un request por cada tecla mientras el campo está vacío o recién empezado, y el
    // backend además devuelve [] para una query en blanco, así que la guarda está de los dos lados.
    enabled: q.length >= 2,
    queryFn: async () => (await apiClient.get<SearchResponseDTO>('/search', { params: { q } })).data.results,
    staleTime: 30_000,
  });
}
