import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { UserDTO } from '@ventry/shared';
import { apiClient } from '../lib/api.js';

const USERS_KEY = ['users'];

export function useUsers() {
  return useQuery({
    queryKey: USERS_KEY,
    queryFn: async () => (await apiClient.get<UserDTO[]>('/users')).data,
  });
}

export interface CreateUserInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: 'ADMIN' | 'VENDEDOR';
  phone?: string;
  commissionPct?: number;
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateUserInput) => (await apiClient.post<UserDTO>('/users', input)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: USERS_KEY }),
  });
}

export function useSetUserStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'ACTIVE' | 'INACTIVE' }) =>
      (await apiClient.patch<UserDTO>(`/users/${id}/status`, { status })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: USERS_KEY }),
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...input
    }: {
      id: string;
      firstName?: string;
      lastName?: string;
      phone?: string;
      commissionPct?: number;
    }) => (await apiClient.patch<UserDTO>(`/users/${id}`, input)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: USERS_KEY }),
  });
}
