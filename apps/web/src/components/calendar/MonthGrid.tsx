import type { CalendarEventDTO } from '@ventry/shared';
import { WEEKDAYS, dayNumber, isSameMonth, monthMatrix, toIso } from '../../lib/calendar.js';
import { todayAsUTC } from '../../lib/date.js';
import { EVENT_STYLE } from './eventStyle.js';

// Cuántos eventos entran en una celda antes de resumir el resto. Con más, las filas de la grilla
// crecen distinto entre semanas y el mes deja de leerse como una tabla.
const MAX_PER_DAY = 3;

export function MonthGrid({
  cursor,
  events,
  onPickDay,
}: {
  cursor: Date;
  events: CalendarEventDTO[];
  onPickDay: (iso: string) => void;
}) {
  const weeks = monthMatrix(cursor);
  const today = toIso(todayAsUTC());

  // Un índice por día en vez de filtrar el array completo en cada una de las 42 celdas.
  const byDay = new Map<string, CalendarEventDTO[]>();
  for (const event of events) {
    const list = byDay.get(event.date) ?? [];
    list.push(event);
    byDay.set(event.date, list);
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="grid grid-cols-7 border-b border-gray-200">
        {WEEKDAYS.map((day) => (
          <div key={day} className="px-2 py-2 text-center text-xs font-medium uppercase tracking-wide text-gray-500">
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {weeks.flat().map((iso, index) => {
          const outside = !isSameMonth(iso, cursor);
          const dayEvents = byDay.get(iso) ?? [];
          const isToday = iso === today;
          return (
            <button
              key={iso}
              onClick={() => onPickDay(iso)}
              // Cada celda es un botón: hace falta poder saltar de un día del mes a su vista por
              // horas, que es el gesto natural cuando se ve que un día está cargado.
              className={`flex min-h-[104px] flex-col gap-1 border-b border-r border-gray-100 p-1.5 text-left transition-colors hover:bg-gray-50 ${
                outside ? 'bg-gray-50/60' : ''
              } ${index % 7 === 6 ? 'border-r-0' : ''}`}
            >
              <span
                // gray-300 sobre el fondo gris de las celdas de relleno daba 1.41:1 de contraste:
                // el número quedaba prácticamente invisible. La jerarquía entre el mes actual y sus
                // vecinos ahora la marca el salto gray-900 / gray-500, que sí pasa WCAG AA.
                className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${
                  isToday
                    ? 'bg-gray-900 font-medium text-white'
                    : outside
                      ? 'text-gray-500'
                      : 'font-medium text-gray-900'
                }`}
              >
                {dayNumber(iso)}
              </span>
              {dayEvents.slice(0, MAX_PER_DAY).map((event) => {
                const style = EVENT_STYLE[event.source];
                return (
                  <span
                    key={`${event.source}-${event.id}`}
                    title={`${style.label}: ${event.title}`}
                    className={`flex min-w-0 items-center gap-1 rounded px-1 py-0.5 text-[11px] ${style.chip} ${
                      event.done ? 'line-through opacity-60' : ''
                    }`}
                  >
                    {event.time && <span className="shrink-0 tabular-nums opacity-70">{event.time}</span>}
                    <span className="truncate">{event.title}</span>
                  </span>
                );
              })}
              {dayEvents.length > MAX_PER_DAY && (
                <span className="px-1 text-[11px] text-gray-400">+{dayEvents.length - MAX_PER_DAY} más</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
