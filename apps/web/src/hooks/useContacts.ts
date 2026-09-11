import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ContactDTO } from '@roult/shared';
import { apiClient } from '../lib/api.js';
import { usePagedQuery, firstPage, type Page } from './usePagedQuery.js';

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

export function useUpdateContact() {
  const queryClient = useQueryClient();
  return useMutation({
    // companyId no se puede cambiar: updateContactSchema lo omite a propósito, porque mover un
    // contacto de empresa cambia también de quién es y eso merece su propia acción.
    mutationFn: async ({ id, ...input }: { id: string } & Partial<Omit<CreateContactInput, 'companyId'>>) =>
      (await apiClient.patch<ContactDTO>(`/contacts/${id}`, input)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CONTACTS_KEY }),
  });
}

/** La misma lista, pero de a una página y con el total. */
export function useContactsPaged(page: Page = firstPage, companyId?: string) {
  return usePagedQuery<ContactDTO>(CONTACTS_KEY, '/contacts', companyId ? { companyId } : {}, page);
}
