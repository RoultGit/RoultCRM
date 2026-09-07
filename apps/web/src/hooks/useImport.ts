import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ImportCommitDTO, ImportPreviewDTO, ImportableEntity } from '@roult/shared';
import { apiClient } from '../lib/api.js';

type Rows = Record<string, string>[];

export function usePreviewImport() {
  return useMutation({
    mutationFn: async ({ entity, rows }: { entity: ImportableEntity; rows: Rows }) =>
      (await apiClient.post<ImportPreviewDTO>(`/import/${entity}/preview`, { rows })).data,
  });
}

export function useCommitImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ entity, rows, skipIndexes }: { entity: ImportableEntity; rows: Rows; skipIndexes: number[] }) =>
      (await apiClient.post<ImportCommitDTO>(`/import/${entity}/commit`, { rows, skipIndexes })).data,
    onSuccess: (_data, { entity }) => {
      // La lista de la entidad importada queda vieja, y el dashboard también cuenta esos registros.
      queryClient.invalidateQueries({ queryKey: [entity] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
