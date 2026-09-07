import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { CompanyDTO } from '@ventry/shared';
import { apiClient } from '../lib/api.js';

const COMPANIES_KEY = ['companies'];

export function useCompanies() {
  return useQuery({
    queryKey: COMPANIES_KEY,
    queryFn: async () => (await apiClient.get<CompanyDTO[]>('/companies')).data,
  });
}

export interface CreateCompanyInput {
  name: string;
  line: 'WEB' | 'SOFTWARE';
  city?: string;
  source?: string;
  whatsapp?: string;
  email?: string;
  assignedUserId?: string;
  notes?: string;
  confirmDuplicate?: boolean;
}

export function useCreateCompany() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateCompanyInput) => (await apiClient.post<CompanyDTO>('/companies', input)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: COMPANIES_KEY }),
  });
}

export function useUpdateCompany() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string; assignedUserId?: string }) =>
      (await apiClient.patch<CompanyDTO>(`/companies/${id}`, input)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: COMPANIES_KEY }),
  });
}
