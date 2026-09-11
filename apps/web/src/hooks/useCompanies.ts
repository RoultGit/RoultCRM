import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { CompanyDTO, Line } from '@roult/shared';
import { apiClient } from '../lib/api.js';
import { usePagedQuery, firstPage, type Page } from './usePagedQuery.js';

const COMPANIES_KEY = ['companies'];

export type CompanyFilters = Record<string, string | undefined>;

export function useCompanies(filters: CompanyFilters = {}) {
  return useQuery({
  // Los filtros entran en la queryKey: sin eso TanStack sirve el resultado cacheado del filtro
  // anterior y la tabla no cambia al filtrar. Las invalidaciones siguen andando porque hacen match
  // por prefijo de la key.
    queryKey: [...COMPANIES_KEY, filters],
    queryFn: async () => (await apiClient.get<CompanyDTO[]>('/companies', { params: filters })).data,
  });
}

/**
 * Una empresa por su id.
 *
 * Antes la ficha buscaba dentro de la lista completa cacheada. Con paginación eso deja de
 * funcionar: la empresa número 51 no está en la primera página y la ficha decía "no existe o no
 * es tuya" sobre un cliente que sí existe.
 */
export function useCompany(id: string | undefined) {
  return useQuery({
    queryKey: [...COMPANIES_KEY, 'byId', id],
    queryFn: async () => (await apiClient.get<CompanyDTO>(`/companies/${id}`)).data,
    enabled: !!id,
    retry: false,
  });
}

export interface CreateCompanyInput {
  name: string;
  line: Line;
  city?: string;
  source?: string;
  whatsapp?: string;
  email?: string;
  assignedUserId?: string;
  notes?: string;
  confirmDuplicate?: boolean;
}

export function useCreateCompany() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateCompanyInput) => (await apiClient.post<CompanyDTO>('/companies', input)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: COMPANIES_KEY }),
  });
}

export function useUpdateCompany() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string } & Partial<CreateCompanyInput>) =>
      (await apiClient.patch<CompanyDTO>(`/companies/${id}`, input)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: COMPANIES_KEY }),
  });
}

// Borrar una empresa toca varias tablas a la vez (se lleva sus contactos y suelta el lead que la
// creó), así que se invalida todo lo que pudo haber cambiado, no solo la lista de empresas.
export function useDeleteCompany() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      (await apiClient.delete<{ contactsDeleted: number }>(`/companies/${id}`)).data,
    onSuccess: () => {
      for (const key of [COMPANIES_KEY, ['contacts'], ['leads'], ['deals'], ['dashboard'], ['calendar']]) {
        queryClient.invalidateQueries({ queryKey: key });
      }
    },
  });
}

/** La misma lista, pero de a una página y con el total. */
export function useCompaniesPaged(filters: CompanyFilters = {}, page: Page = firstPage) {
  return usePagedQuery<CompanyDTO>(COMPANIES_KEY, '/companies', filters, page);
}
