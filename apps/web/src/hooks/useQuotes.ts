import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QuoteDTO, PublicQuoteDTO, createQuoteSchema, updateQuoteSchema } from '@roult/shared';
import type { z } from 'zod';
import { apiClient } from '../lib/api.js';

const KEY = ['quotes'];

export interface QuoteFilters {
  companyId?: string;
  status?: string;
}

export function useQuotes(filters: QuoteFilters = {}) {
  return useQuery({
    // Los filtros van en la llave: con una llave fija, la lista filtrada pisaría la completa en
    // la caché y la pantalla mostraría lo que no corresponde.
    queryKey: [...KEY, filters],
    queryFn: async () => (await apiClient.get<QuoteDTO[]>('/quotes', { params: filters })).data,
  });
}

export function useCreateQuote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: z.infer<typeof createQuoteSchema>) =>
      (await apiClient.post<QuoteDTO>('/quotes', input)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateQuote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string } & z.infer<typeof updateQuoteSchema>) =>
      (await apiClient.patch<QuoteDTO>(`/quotes/${id}`, input)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useSendQuote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await apiClient.post<QuoteDTO>(`/quotes/${id}/send`)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteQuote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/quotes/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

/** La vista del cliente. No lleva sesión: la abre alguien que no tiene cuenta. */
export function usePublicQuote(token: string | undefined) {
  return useQuery({
    queryKey: ['public-quote', token],
    queryFn: async () => (await apiClient.get<PublicQuoteDTO>(`/quotes/public/${token}`)).data,
    enabled: !!token,
    retry: false,
  });
}

export function useRespondQuote(token: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { accept: boolean; respondedBy: string }) =>
      (await apiClient.post(`/quotes/public/${token}/respond`, input)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['public-quote', token] }),
  });
}
