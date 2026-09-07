import type { CalendarEventDTO } from '@ventry/shared';
import { HOURS, HOUR_FROM, HOUR_TO, WEEKDAYS, dayNumber, fromIso, timeToDecimal, toIso } from '../../lib/calendar.js';
import { todayAsUTC } from '../../lib/date.js';
import { EVENT_STYLE } from './eventStyle.js';

const HOUR_HEIGHT = 56;

// Los eventos sin hora no pueden ubicarse en la grilla, y clavarlos a las 00:00 sería inventar un
// dato. Van a la fila "Todo el día" de arriba, igual que en la referencia.
function splitByTime(events: CalendarEventDTO[]) {
  return {
    allDay: events.filter((event) => !event.time),
    timed: events.filter((event) => event.time),
  };
}

function EventCard({ event, compact }: { event: CalendarEventDTO; compact?: boolean }) {
  const style = EVENT_STYLE[event.source];
  // Hora y detalle van juntos en UNA línea: con título, detalle y hora en tres renglones el texto
  // no entraba en los 50px de alto de la franja y se cortaba a la mitad de la última línea.
  const meta = [event.time, event.subtitle].filter(Boolean).join(' · ');
  return (
    <div
      title={`${style.label}: ${event.title}${event.subtitle ? ` · ${event.subtitle}` : ''}`}
      className={`h-full overflow-hidden rounded-md border border-white/60 px-2 py-1 ${style.chip} ${
        event.done ? 'opacity-60' : ''
      }`}
    >
      <p className={`truncate text-xs font-medium ${event.done ? 'line-through' : ''}`}>{event.title}</p>
      {!compact && meta && <p className="truncate text-[11px] opacity-70">{meta}</p>}
    </div>
  );
}

export function TimeGrid({ days, events }: { days: string[]; events: CalendarEventDTO[] }) {
  const today = toIso(todayAsUTC());
  const byDay = new Map<string, CalendarEventDTO[]>();
  for (const event of events) {
    const list = byDay.get(event.date) ?? [];
    list.push(event);
    byDay.set(event.date, list);
  }

  const columns = days.map((iso) => ({ iso, ...splitByTime(byDay.get(iso) ?? []) }));
  // La fila de "todo el día" mide lo que necesita el día más cargado. Si cada columna se midiera
  // sola, las columnas quedarían desalineadas entre sí y las horas no arrancarían a la misma altura.
  const allDayRows = Math.max(0, ...columns.map((column) => column.allDay.length));

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          {/* Encabezado */}
          <div className="flex border-b border-gray-200">
            <div className="w-16 shrink-0" />
            {columns.map((column) => {
              const date = fromIso(column.iso);
              const isToday = column.iso === today;
              return (
                <div key={column.iso} className="flex-1 border-l border-gray-100 py-2 text-center">
                  <p className="text-xs uppercase tracking-wide text-gray-400">
                    {WEEKDAYS[(date.getUTCDay() + 6) % 7]}
                  </p>
                  <p
                    className={`mx-auto mt-1 flex h-7 w-7 items-center justify-center rounded-full text-sm ${
                      isToday ? 'bg-gray-900 font-medium text-white' : 'text-gray-900'
                    }`}
                  >
                    {dayNumber(column.iso)}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Todo el día */}
          {allDayRows > 0 && (
            <div className="flex border-b border-gray-200 bg-gray-50/60">
              <div className="w-16 shrink-0 px-2 py-2 text-right text-[10px] leading-tight text-gray-400">
                Todo el día
              </div>
              {columns.map((column) => (
                // min-w-0: un hijo de flex no baja de su ancho de contenido por defecto, así que un
                // título largo empujaba la columna y se metía sobre el día siguiente.
                <div key={column.iso} className="flex min-w-0 flex-1 flex-col gap-1 border-l border-gray-100 p-1">
                  {column.allDay.map((event) => (
                    <div key={`${event.source}-${event.id}`} className="h-7">
                      <EventCard event={event} compact />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* Franjas horarias */}
          {/* pt-3: la etiqueta de cada hora va centrada sobre su línea, así que la primera sobresale
              media altura por arriba y el overflow de la card se la comía. */}
          <div className="relative flex pt-3">
            <div className="w-16 shrink-0">
              {HOURS.map((hour) => (
                <div key={hour} style={{ height: HOUR_HEIGHT }} className="relative">
                  {/* -translate-y-1/2 deja la etiqueta centrada sobre su línea, no colgando debajo. */}
                  <span className="absolute right-2 top-0 -translate-y-1/2 text-[11px] text-gray-400">
                    {String(hour).padStart(2, '0')}:00
                  </span>
                </div>
              ))}
            </div>
            {columns.map((column) => (
              <div key={column.iso} className="relative min-w-0 flex-1 border-l border-gray-100">
                {HOURS.map((hour) => (
                  <div key={hour} style={{ height: HOUR_HEIGHT }} className="border-t border-gray-100" />
                ))}
                {column.timed.map((event) => {
                  const top = (timeToDecimal(event.time!) - HOUR_FROM) * HOUR_HEIGHT;
                  return (
                    <div
                      key={`${event.source}-${event.id}`}
                      className="absolute inset-x-1"
                      style={{
                        // Un evento antes de las 7 o después de las 20 se pega al borde en vez de
                        // dibujarse fuera de la grilla, donde quedaría invisible.
                        top: Math.max(0, Math.min(top, (HOUR_TO - HOUR_FROM) * HOUR_HEIGHT - 8)),
                        height: HOUR_HEIGHT - 6,
                      }}
                    >
                      <EventCard event={event} />
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
