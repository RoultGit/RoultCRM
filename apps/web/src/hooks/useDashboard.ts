import { useQuery } from '@tanstack/react-query';
import type { DashboardDTO } from '@ventry/shared';
import { apiClient } from '../lib/api.js';

export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => (await apiClient.get<DashboardDTO>('/dashboard')).data,
  });
}
