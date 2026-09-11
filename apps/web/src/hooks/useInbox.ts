import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/api.js';

export interface InboxStatus {
  enabled: boolean;
  address: string | null;
  /** Si falta el secreto del servidor, la dirección existe pero no puede recibir nada. */
  ready: boolean;
}

const KEY = ['email', 'inbox'];

export function useInbox() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => (await apiClient.get<InboxStatus>('/email/inbox')).data,
    staleTime: 5 * 60_000,
  });
}

export function useEnableInbox() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => (await apiClient.post<InboxStatus>('/email/inbox')).data,
    onSuccess: (data) => queryClient.setQueryData(KEY, data),
  });
}

export function useDisableInbox() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => (await apiClient.delete<InboxStatus>('/email/inbox')).data,
    onSuccess: (data) => queryClient.setQueryData(KEY, data),
  });
}
