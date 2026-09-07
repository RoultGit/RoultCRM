import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../components/ui/button.js';
import { Card } from '../components/ui/card.js';
import { useCalendar } from '../hooks/useCalendar.js';
import { MonthGrid } from '../components/calendar/MonthGrid.js';
import { TimeGrid } from '../components/calendar/TimeGrid.js';
import { EVENT_STYLE } from '../components/calendar/eventStyle.js';
import { MONTH_NAMES, addDays, addMonths, fromIso, monthMatrix, toIso, weekDays } from '../lib/calendar.js';
import { todayAsUTC } from '../lib/date.js';

const VIEWS = [
  { key: 'day', label: 'Día' },
  { key: 'week', label: 'Semana' },
  { key: 'month', label: 'Mes' },
] as const;

type View = (typeof VIEWS)[number]['key'];

// Qué días abarca cada vista y qué rango hay que pedirle al backend. El mes pide las 6 semanas
// completas de la grilla, no del 1 al 30: si no, los días de relleno del principio y del final
// aparecerían siempre vacíos aunque tengan eventos.
function rangeFor(view: View, cursor: Date): { days: string[]; from: string; to: string; title: string } {
  if (view === 'day') {
    const iso = toIso(cursor);
    return {
      days: [iso],
      from: iso,
      to: iso,
      title: `${cursor.getUTCDate()} de ${MONTH_NAMES[cursor.getUTCMonth()].toLowerCase()} de ${cursor.getUTCFullYear()}`,
    };
  }
  if (view === 'week') {
    const days = weekDays(cursor);
    const first = fromIso(days[0]);
    const last = fromIso(days[6]);
    const sameMonth = first.getUTCMonth() === last.getUTCMonth();
    return {
      days,
      from: days[0],
      to: days[6],
      title: sameMonth
        ? `${first.getUTCDate()} – ${last.getUTCDate()} de ${MONTH_NAMES[first.getUTCMonth()].toLowerCase()}`
        : `${first.getUTCDate()} ${MONTH_NAMES[first.getUTCMonth()].slice(0, 3).toLowerCase()} – ${last.getUTCDate()} ${MONTH_NAMES[last.getUTCMonth()].slice(0, 3).toLowerCase()}`,
    };
  }
  const grid = monthMatrix(cursor).flat();
  return {
    days: grid,
    from: grid[0],
    to: grid[grid.length - 1],
    title: `${MONTH_NAMES[cursor.getUTCMonth()]} ${cursor.getUTCFullYear()}`,
  };
}

export function CalendarPage() {
  const [view, setView] = useState<View>('month');
  const [cursor, setCursor] = useState(todayAsUTC());
  const { days, from, to, title } = rangeFor(view, cursor);
  const { data: events, isLoading } = useCalendar(from, to);

  const move = (direction: 1 | -1) =>
    setCursor((current) =>
      view === 'month' ? addMonths(current, direction) : addDays(current, direction * (view === 'week' ? 7 : 1))
    );

  // Ir al día desde la vista de mes: se cambia de vista y de fecha a la vez, que es lo que espera
  // alguien que hace click en un día cargado.
  const pickDay = (iso: string) => {
    setCursor(fromIso(iso));
    setView('day');
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Calendario</h1>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-lg border border-gray-200 bg-white p-0.5">
            {VIEWS.map((option) => (
              <button
                key={option.key}
                onClick={() => setView(option.key)}
                aria-pressed={view === option.key}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  view === option.key ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={() => setCursor(todayAsUTC())}>
            Hoy
          </Button>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <button
            onClick={() => move(-1)}
            aria-label="Anterior"
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-900"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => move(1)}
            aria-label="Siguiente"
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-900"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        {/* first-letter y no capitalize: capitalize pone mayúscula en CADA palabra y el título salía
            como "7 – 13 De Septiembre". */}
        <span className="text-sm font-medium first-letter:uppercase text-gray-900">{title}</span>
        {/* La leyenda explica el color. Sin ella, el azul y el ámbar son decoración. */}
        <div className="ml-auto flex flex-wrap items-center gap-3">
          {Object.entries(EVENT_STYLE).map(([source, style]) => (
            <span key={source} className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className={`h-2 w-2 rounded-full ${style.bar}`} />
              {style.label}
            </span>
          ))}
        </div>
      </div>

      {isLoading && !events ? (
        <Card className="p-6 text-sm text-gray-500">Cargando…</Card>
      ) : view === 'month' ? (
        <MonthGrid cursor={cursor} events={events ?? []} onPickDay={pickDay} />
      ) : (
        <TimeGrid days={days} events={events ?? []} />
      )}
    </div>
  );
}
