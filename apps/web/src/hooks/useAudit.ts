import { useQuery } from '@tanstack/react-query';
import type { AuditEntryDTO } from '@ventry/shared';
import { apiClient } from '../lib/api.js';

export function useAudit() {
  return useQuery({
    queryKey: ['audit'],
    queryFn: async () => (await apiClient.get<AuditEntryDTO[]>('/audit')).data,
  });
}
