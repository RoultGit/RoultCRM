import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { TaskDTO } from '@roult/shared';
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
  dueTime?: string;
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
    mutationFn: async ({ id, ...input }: { id: string } & Partial<CreateTaskInput>) =>
      (await apiClient.patch<TaskDTO>(`/tasks/${id}`, input)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TASKS_KEY }),
  });
}

// Mover una tarea de columna es el gesto más repetido del tablero, así que se pinta antes de que
// conteste el servidor. Mismo criterio (y misma trampa) que el pipeline de deals: setQueriesData
// hace match por prefijo, y se escribe la caché ANTES del cancelQueries para no meter un await de
// red delante del repintado.
export function useSetTaskStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: TaskDTO['status'] }) =>
      (await apiClient.patch<TaskDTO>(`/tasks/${id}/status`, { status })).data,
    onMutate: async ({ id, status }) => {
      const previous = queryClient.getQueriesData<TaskDTO[]>({ queryKey: TASKS_KEY });
      queryClient.setQueriesData<TaskDTO[]>({ queryKey: TASKS_KEY }, (tasks) =>
        tasks?.map((task) => (task.id === id ? { ...task, status } : task))
      );
      await queryClient.cancelQueries({ queryKey: TASKS_KEY });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      context?.previous.forEach(([key, data]) => queryClient.setQueryData(key, data));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: TASKS_KEY }),
  });
}
