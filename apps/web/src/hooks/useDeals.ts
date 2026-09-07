import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { DealDTO } from '@ventry/shared';
import { apiClient } from '../lib/api.js';

const DEALS_KEY = ['deals'];

export function useDeals() {
  return useQuery({
    queryKey: DEALS_KEY,
    queryFn: async () => (await apiClient.get<DealDTO[]>('/deals')).data,
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
    // Update optimista: sin esto la card vuelve a saltar a su columna vieja entre que se suelta y
    // que responde el refetch, y el arrastre se siente roto aunque haya funcionado.
    onMutate: async ({ id, stage }) => {
      await queryClient.cancelQueries({ queryKey: DEALS_KEY });
      const previous = queryClient.getQueryData<DealDTO[]>(DEALS_KEY);
      queryClient.setQueryData<DealDTO[]>(DEALS_KEY, (deals) =>
        deals?.map((deal) => (deal.id === id ? { ...deal, stage } : deal))
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(DEALS_KEY, context.previous);
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
