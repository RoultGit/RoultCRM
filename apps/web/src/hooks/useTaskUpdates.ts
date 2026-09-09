import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { TaskUpdateDTO, createTaskUpdateSchema } from '@roult/shared';
import type { z } from 'zod';
import { apiClient } from '../lib/api.js';

// El historial se pide por tarea y solo cuando se abre su diálogo: traerlo para las 40 tarjetas del
// tablero serían 40 consultas para un dato que casi nunca se mira.
export function useTaskUpdates(taskId: string | null) {
  return useQuery({
    queryKey: ['tasks', taskId, 'updates'],
    queryFn: async () => (await apiClient.get<TaskUpdateDTO[]>(`/tasks/${taskId}/updates`)).data,
    enabled: !!taskId,
  });
}

export function useAddTaskUpdate(taskId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: z.infer<typeof createTaskUpdateSchema>) =>
      (await apiClient.post<TaskUpdateDTO>(`/tasks/${taskId}/updates`, input)).data,
    // Se invalidan las dos: el historial y la lista de tareas, porque el avance también mueve la
    // barra de la tarjeta.
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', taskId, 'updates'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
