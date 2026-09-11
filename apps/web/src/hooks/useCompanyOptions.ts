import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../lib/api.js';

/**
 * Solo id y nombre, para los selectores de cliente.
 *
 * No usa la lista paginada a propósito: con paginación, el cliente número 51 desaparecía del
 * desplegable sin que nada avisara, y el vendedor concluía que ese cliente no existe.
 */
export function useCompanyOptions(q?: string) {
  return useQuery({
    queryKey: ['companies', 'options', q ?? ''],
    queryFn: async () =>
      (await apiClient.get<{ id: string; name: string }[]>('/companies/options', { params: q ? { q } : {} })).data,
    staleTime: 60_000,
  });
}
