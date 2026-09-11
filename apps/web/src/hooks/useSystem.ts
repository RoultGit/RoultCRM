import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/api.js';

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

/** Solo lo ve el dueño de la plataforma: adentro hay rastros de todas las empresas cliente. */
export function useSystemErrors(enabled: boolean) {
  return useQuery({
    queryKey: ['system', 'errors'],
    queryFn: async () => (await apiClient.get<ErrorLogDTO[]>('/system/errors')).data,
    enabled,
    refetchInterval: 60_000,
  });
}

export function useSuspendTenant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, suspended }: { id: string; suspended: boolean }) =>
      (await apiClient.patch<{ users: number }>(`/tenants/${id}/suspend`, { suspended })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tenants'] }),
  });
}

export function useDeleteTenant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, confirmName }: { id: string; confirmName: string }) => {
      await apiClient.delete(`/tenants/${id}`, { data: { confirmName } });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tenants'] }),
  });
}
