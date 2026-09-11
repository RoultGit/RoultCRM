import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  InstallmentDTO,
  ReceivableTotals,
  createInstallmentSchema,
  generatePlanSchema,
  payInstallmentSchema,
} from '@roult/shared';
import type { z } from 'zod';
import { apiClient } from '../lib/api.js';

const KEY = ['installments'];

export interface InstallmentFilters {
  dealId?: string;
  companyId?: string;
  status?: 'pending' | 'overdue' | 'paid';
}

export function useInstallments(filters: InstallmentFilters = {}) {
  return useQuery({
    // Los filtros van en la llave: con una fija, la lista filtrada pisaría la completa en la caché.
    queryKey: [...KEY, filters],
    queryFn: async () => (await apiClient.get<InstallmentDTO[]>('/installments', { params: filters })).data,
  });
}

export function useReceivableTotals() {
  return useQuery({
    queryKey: [...KEY, 'totals'],
    queryFn: async () => (await apiClient.get<ReceivableTotals>('/installments/totals')).data,
  });
}

function useRefetchAll() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: KEY });
}

export function useGeneratePlan() {
  const refetch = useRefetchAll();
  return useMutation({
    mutationFn: async (input: z.infer<typeof generatePlanSchema>) =>
      (await apiClient.post<InstallmentDTO[]>('/installments/generate', input)).data,
    onSuccess: refetch,
  });
}

export function useCreateInstallment() {
  const refetch = useRefetchAll();
  return useMutation({
    mutationFn: async (input: z.infer<typeof createInstallmentSchema>) =>
      (await apiClient.post<InstallmentDTO>('/installments', input)).data,
    onSuccess: refetch,
  });
}

export function usePayInstallment() {
  const refetch = useRefetchAll();
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string } & z.infer<typeof payInstallmentSchema>) =>
      (await apiClient.post<InstallmentDTO>(`/installments/${id}/pay`, input)).data,
    onSuccess: refetch,
  });
}

export function useUnpayInstallment() {
  const refetch = useRefetchAll();
  return useMutation({
    mutationFn: async (id: string) => (await apiClient.post<InstallmentDTO>(`/installments/${id}/unpay`)).data,
    onSuccess: refetch,
  });
}

export function useDeleteInstallment() {
  const refetch = useRefetchAll();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/installments/${id}`);
    },
    onSuccess: refetch,
  });
}
