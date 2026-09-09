import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreatedTenantDTO, TenantDTO, createTenantSchema } from '@roult/shared';
import type { z } from 'zod';
import { apiClient } from '../lib/api.js';

const TENANTS_KEY = ['tenants'];

export function useTenants(enabled: boolean) {
  return useQuery({
    queryKey: TENANTS_KEY,
    queryFn: async () => (await apiClient.get<TenantDTO[]>('/tenants')).data,
    // enabled: sin esto, un admin común dispararía la consulta igual y se comería un 403 en cada
    // carga de la app. El permiso ya se corta en el servidor; esto evita el ruido.
    enabled,
  });
}

export function useCreateTenant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: z.infer<typeof createTenantSchema>) =>
      (await apiClient.post<CreatedTenantDTO>('/tenants', input)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TENANTS_KEY }),
  });
}
