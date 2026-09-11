import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { defaultStages, type PipelineStageDTO, type DealStage } from '@roult/shared';
import { apiClient } from '../lib/api.js';

const KEY = ['pipeline', 'stages'];

export function usePipelineStages() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => (await apiClient.get<PipelineStageDTO[]>('/pipeline/stages')).data,
    // Los nombres de las etapas se leen en cada pantalla del pipeline y casi nunca cambian.
    staleTime: 5 * 60_000,
    // Mientras carga se usan los de fábrica: sin esto el tablero parpadea sin nombres de columna.
    placeholderData: defaultStages(),
  });
}

/** El nombre que esta empresa le puso a cada etapa, listo para usar como diccionario. */
export function useStageLabels(): Record<DealStage, string> {
  const { data } = usePipelineStages();
  return Object.fromEntries((data ?? defaultStages()).map((e) => [e.stage, e.label])) as Record<DealStage, string>;
}

export function useUpdateStage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ stage, ...input }: { stage: DealStage; label?: string; enabled?: boolean }) =>
      (await apiClient.patch<PipelineStageDTO>(`/pipeline/stages/${stage}`, input)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}
