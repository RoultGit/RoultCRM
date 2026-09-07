import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { TaskDTO } from '@ventry/shared';
import { apiClient } from '../lib/api.js';

const TASKS_KEY = ['tasks'];

export function useTasks() {
  return useQuery({
    queryKey: TASKS_KEY,
    queryFn: async () => (await apiClient.get<TaskDTO[]>('/tasks')).data,
  });
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  ownerId?: string;
  dueDate: string;
}

export function useCreateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateTaskInput) => (await apiClient.post<TaskDTO>('/tasks', input)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TASKS_KEY }),
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string; done?: boolean; title?: string; dueDate?: string }) =>
      (await apiClient.patch<TaskDTO>(`/tasks/${id}`, input)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TASKS_KEY }),
  });
}
