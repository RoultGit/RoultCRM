import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { DealDTO } from '@ventry/shared';
import { apiClient } from '../lib/api.js';

const DEALS_KEY = ['deals'];

export type DealFilters = Record<string, string | undefined>;

export function useDeals(filters: DealFilters = {}) {
  return useQuery({
  // Los filtros entran en la queryKey: sin eso TanStack sirve el resultado cacheado del filtro
  // anterior y la tabla no cambia al filtrar. Las invalidaciones siguen andando porque hacen match
  // por prefijo de la key.
    queryKey: [...DEALS_KEY, filters],
    queryFn: async () => (await apiClient.get<DealDTO[]>('/deals', { params: filters })).data,
  });
}

export interface CreateDealInput {
  companyId: string;
  title: string;
  amount: string;
  currency: 'PEN' | 'USD';
  assignedUserId?: string;
  expectedCloseDate?: string;
  nextStepDescription?: string;
  nextStepOwnerId?: string;
  nextStepDate?: string;
}

export function useCreateDeal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateDealInput) => (await apiClient.post<DealDTO>('/deals', input)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: DEALS_KEY }),
  });
}

export function useUpdateDeal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<CreateDealInput> & { id: string }) =>
      (await apiClient.patch<DealDTO>(`/deals/${id}`, input)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: DEALS_KEY }),
  });
}

export function useSetDealStage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, stage, lostReason }: { id: string; stage: DealDTO['stage']; lostReason?: string }) =>
      (await apiClient.patch<DealDTO>(`/deals/${id}/stage`, { stage, lostReason })).data,
    // Update optimista: sin esto la card se queda en su columna vieja hasta que vuelve el refetch,
    // y el arrastre se siente lento aunque haya funcionado.
    // OJO con la key: la query real es ['deals', filters], no ['deals']. setQueryData(DEALS_KEY)
    // escribía en una entrada de caché que no lee nadie, así que el update optimista no hacía nada
    // y la card recién se movía cuando respondía el servidor. setQueriesData hace match por
    // prefijo, o sea que alcanza a la lista con cualquier combinación de filtros activa.
    onMutate: async ({ id, stage }) => {
      await queryClient.cancelQueries({ queryKey: DEALS_KEY });
      const previous = queryClient.getQueriesData<DealDTO[]>({ queryKey: DEALS_KEY });
      queryClient.setQueriesData<DealDTO[]>({ queryKey: DEALS_KEY }, (deals) =>
        deals?.map((deal) => (deal.id === id ? { ...deal, stage } : deal))
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      context?.previous.forEach(([key, data]) => queryClient.setQueryData(key, data));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: DEALS_KEY }),
  });
}

export function useAssignDeal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, assignedUserId }: { id: string; assignedUserId?: string }) =>
      (await apiClient.patch<DealDTO>(`/deals/${id}/assign`, { assignedUserId })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: DEALS_KEY }),
  });
}
