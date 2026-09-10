import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ActivityDTO, createActivitySchema } from '@roult/shared';
import type { z } from 'zod';
import { apiClient } from '../lib/api.js';

type Related = { relatedType: ActivityDTO['relatedType']; relatedId: string };

export function useActivities(related: Related | null) {
  return useQuery({
    queryKey: ['activities', related?.relatedType, related?.relatedId],
    queryFn: async () =>
      (await apiClient.get<ActivityDTO[]>('/activities', { params: related! })).data,
    enabled: !!related,
  });
}

export function useLogActivity(related: Related | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<z.infer<typeof createActivitySchema>, 'relatedType' | 'relatedId'>) =>
      (await apiClient.post<ActivityDTO>('/activities', { ...related, ...input })).data,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['activities', related?.relatedType, related?.relatedId] }),
  });
}
