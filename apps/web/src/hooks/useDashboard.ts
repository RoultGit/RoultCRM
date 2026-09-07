import { useQuery } from '@tanstack/react-query';
import type { DashboardDTO, DashboardChartsDTO } from '@ventry/shared';
import { apiClient } from '../lib/api.js';

export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => (await apiClient.get<DashboardDTO>('/dashboard')).data,
  });
}

export function useDashboardCharts(months: number) {
  return useQuery({
    // months en la key: sin eso, cambiar el rango sirve el resultado cacheado del rango anterior.
    queryKey: ['dashboard', 'charts', months],
    queryFn: async () =>
      (await apiClient.get<DashboardChartsDTO>('/dashboard/charts', { params: { months } })).data,
  });
}
