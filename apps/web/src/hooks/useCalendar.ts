import { useQuery } from '@tanstack/react-query';
import type { CalendarEventDTO } from '@ventry/shared';
import { apiClient } from '../lib/api.js';

// El rango entra en la queryKey: sin eso, cambiar de mes serviría el resultado cacheado del mes
// anterior y el calendario se quedaría mostrando lo mismo.
export function useCalendar(from: string, to: string) {
  return useQuery({
    queryKey: ['calendar', from, to],
    queryFn: async () =>
      (await apiClient.get<CalendarEventDTO[]>('/calendar', { params: { from, to } })).data,
    // Al navegar entre meses, mantener lo anterior en pantalla evita el parpadeo a vacío mientras
    // llega la respuesta: la grilla no se vacía y después se vuelve a llenar.
    placeholderData: (previous) => previous,
  });
}
