import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AutomationDTO, AutomationRunDTO, AutomationCode } from '@roult/shared';
import { apiClient } from '../lib/api.js';

const KEY = ['automations'];

export function useAutomations() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => (await apiClient.get<AutomationDTO[]>('/automations')).data,
  });
}

export function useAutomationRuns() {
  return useQuery({
    queryKey: [...KEY, 'runs'],
    queryFn: async () => (await apiClient.get<AutomationRunDTO[]>('/automations/runs')).data,
  });
}

export function useUpdateAutomation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      code,
      ...input
    }: { code: AutomationCode; enabled?: boolean; config?: Record<string, string | number> }) =>
      (await apiClient.patch<AutomationDTO>(`/automations/${code}`, input)).data,
    // Se pinta primero y se confirma después: el interruptor tiene que responder al toque, no
    // esperar al servidor para moverse.
    onMutate: async ({ code, enabled }) => {
      const previo = queryClient.getQueryData<AutomationDTO[]>(KEY);
      if (enabled !== undefined) {
        queryClient.setQueryData<AutomationDTO[]>(KEY, (actual) =>
          actual?.map((a) => (a.code === code ? { ...a, enabled } : a))
        );
      }
      await queryClient.cancelQueries({ queryKey: KEY });
      return { previo };
    },
    onError: (_err, _vars, context) => {
      if (context?.previo) queryClient.setQueryData(KEY, context.previo);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}
