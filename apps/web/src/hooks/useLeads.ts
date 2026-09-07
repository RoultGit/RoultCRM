import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { LeadDTO, Line, BillingType } from '@roult/shared';
import { apiClient } from '../lib/api.js';

const LEADS_KEY = ['leads'];

export type LeadFilters = Record<string, string | undefined>;

export function useLeads(filters: LeadFilters = {}) {
  return useQuery({
  // Los filtros entran en la queryKey: sin eso TanStack sirve el resultado cacheado del filtro
  // anterior y la tabla no cambia al filtrar. Las invalidaciones siguen andando porque hacen match
  // por prefijo de la key.
    queryKey: [...LEADS_KEY, filters],
    queryFn: async () => (await apiClient.get<LeadDTO[]>('/leads', { params: filters })).data,
  });
}

export interface CreateLeadInput {
  businessName: string;
  contactName: string;
  representativeName?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  line: Line;
  billingType?: BillingType;
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
    mutationFn: async ({ id, ...input }: { id: string } & Partial<CreateLeadInput>) =>
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
    mutationFn: async ({
      id,
      confirmDuplicate,
      deal,
    }: {
      id: string;
      confirmDuplicate?: boolean;
      deal?: { title: string; amount: string; currency: 'PEN' | 'USD'; billingType?: BillingType };
    }) => (await apiClient.post(`/leads/${id}/convert`, { confirmDuplicate, deal })).data,
    // Convertir toca cinco cosas a la vez: el lead, la empresa, el contacto, el deal y los números
    // del dashboard. Sin esto el pipeline no muestra la venta recién creada hasta recargar.
    onSuccess: () => {
      for (const key of [['leads'], ['companies'], ['contacts'], ['deals'], ['dashboard']]) {
        queryClient.invalidateQueries({ queryKey: key });
      }
    },
  });
}
