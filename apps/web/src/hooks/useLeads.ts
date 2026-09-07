import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { LeadDTO } from '@ventry/shared';
import { apiClient } from '../lib/api.js';

const LEADS_KEY = ['leads'];

export function useLeads() {
  return useQuery({
    queryKey: LEADS_KEY,
    queryFn: async () => (await apiClient.get<LeadDTO[]>('/leads')).data,
  });
}

export interface CreateLeadInput {
  businessName: string;
  contactName: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  line: 'WEB' | 'SOFTWARE';
  source?: string;
  assignedUserId?: string;
  notes?: string;
}

export function useCreateLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateLeadInput) => (await apiClient.post<LeadDTO>('/leads', input)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LEADS_KEY }),
  });
}

export function useUpdateLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string; assignedUserId?: string }) =>
      (await apiClient.patch<LeadDTO>(`/leads/${id}`, input)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LEADS_KEY }),
  });
}

export function useSetLeadStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Exclude<LeadDTO['status'], 'CONVERTED'> }) =>
      (await apiClient.patch<LeadDTO>(`/leads/${id}/status`, { status })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LEADS_KEY }),
  });
}

export function useConvertLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, confirmDuplicate }: { id: string; confirmDuplicate?: boolean }) =>
      (await apiClient.post(`/leads/${id}/convert`, { confirmDuplicate })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LEADS_KEY }),
  });
}
