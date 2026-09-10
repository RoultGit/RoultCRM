import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  CustomFieldDTO,
  CustomValuesDTO,
  createCustomFieldSchema,
  updateCustomFieldSchema,
} from '@roult/shared';
import type { z } from 'zod';
import { apiClient } from '../lib/api.js';

const FIELDS = ['custom-fields'];
type Entity = CustomFieldDTO['entity'];

export function useCustomFields(entity?: Entity, enabled = true) {
  return useQuery({
    queryKey: [...FIELDS, entity ?? 'all'],
    queryFn: async () =>
      (await apiClient.get<CustomFieldDTO[]>('/custom-fields', { params: entity ? { entity } : {} })).data,
    enabled,
  });
}

export function useCreateCustomField() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: z.infer<typeof createCustomFieldSchema>) =>
      (await apiClient.post<CustomFieldDTO>('/custom-fields', input)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: FIELDS }),
  });
}

export function useUpdateCustomField() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string } & z.infer<typeof updateCustomFieldSchema>) =>
      (await apiClient.patch<CustomFieldDTO>(`/custom-fields/${id}`, input)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: FIELDS }),
  });
}

export function useCustomValues(entity: Entity, recordId: string | null) {
  return useQuery({
    queryKey: ['custom-values', entity, recordId],
    queryFn: async () =>
      (await apiClient.get<CustomValuesDTO>('/custom-fields/values', { params: { entity, recordId } })).data,
    enabled: !!recordId,
  });
}

export function useSetCustomValues(entity: Entity, recordId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (values: Record<string, string>) =>
      (await apiClient.put<CustomValuesDTO>('/custom-fields/values', { entity, recordId, values })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['custom-values', entity, recordId] }),
  });
}
