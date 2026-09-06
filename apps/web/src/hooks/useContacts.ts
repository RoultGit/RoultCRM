import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ContactDTO } from '@ventry/shared';
import { apiClient } from '../lib/api.js';

const CONTACTS_KEY = ['contacts'];

export function useContacts() {
  return useQuery({
    queryKey: CONTACTS_KEY,
    queryFn: async () => (await apiClient.get<ContactDTO[]>('/contacts')).data,
  });
}

export interface CreateContactInput {
  companyId: string;
  name: string;
  position?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  notes?: string;
  confirmDuplicate?: boolean;
}

export function useCreateContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateContactInput) => (await apiClient.post<ContactDTO>('/contacts', input)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CONTACTS_KEY }),
  });
}
