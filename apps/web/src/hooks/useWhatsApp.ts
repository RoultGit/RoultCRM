import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CustomFieldDTO } from '@roult/shared';

type RelatedType = CustomFieldDTO['entity'];
import { apiClient } from '../lib/api.js';

export interface WhatsAppStatus {
  connected: boolean;
  encryptionReady: boolean;
  phoneNumberId?: string;
  displayPhone?: string | null;
  verifyToken?: string;
  webhookUrl: string;
  lastError?: string | null;
  lastErrorAt?: string | null;
}

const KEY = ['whatsapp', 'status'];

export function useWhatsAppStatus() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => (await apiClient.get<WhatsAppStatus>('/whatsapp/status')).data,
    // El estado no cambia solo: solo cuando alguien conecta o desconecta la cuenta.
    staleTime: 5 * 60_000,
  });
}

export function useConnectWhatsApp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      phoneNumberId: string;
      accessToken: string;
      appSecret?: string;
      displayPhone?: string;
    }) => (await apiClient.post<WhatsAppStatus>('/whatsapp/connect', input)).data,
    onSuccess: (data) => queryClient.setQueryData(KEY, data),
  });
}

export function useDisconnectWhatsApp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await apiClient.delete('/whatsapp/connect');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useSendWhatsApp(relatedType: RelatedType, relatedId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ to, body }: { to: string; body: string }) =>
      (await apiClient.post('/whatsapp/send', { relatedType, relatedId, to, body })).data,
    // El mensaje queda en la historia del cliente, así que la línea de tiempo tiene que refrescarse.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['activities', relatedType, relatedId] }),
  });
}
