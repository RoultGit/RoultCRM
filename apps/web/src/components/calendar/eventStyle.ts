import type { CalendarEventDTO } from '@roult/shared';

// El color codifica QUÉ es el evento, no quién lo creó: una tarea propia, el próximo paso de una
// venta y un cierre estimado exigen cosas distintas, y en una semana cargada eso es lo que hay que
// distinguir de un vistazo. Los tonos son los mismos del Badge del sistema.
export const EVENT_STYLE: Record<CalendarEventDTO['source'], { chip: string; bar: string; label: string }> = {
  TASK: { chip: 'bg-gray-100 text-gray-700', bar: 'bg-gray-400', label: 'Tarea' },
  DEAL_NEXT_STEP: { chip: 'bg-blue-50 text-blue-700', bar: 'bg-blue-500', label: 'Próximo paso' },
  DEAL_CLOSE: { chip: 'bg-amber-50 text-amber-700', bar: 'bg-amber-500', label: 'Cierre estimado' },
};
