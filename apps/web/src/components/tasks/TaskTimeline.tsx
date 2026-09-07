import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { TaskDTO, UserDTO } from '@ventry/shared';
import { Card } from '../ui/card.js';
import { OwnerAvatar, STATUS_META, isTaskOverdue } from './shared.js';
import { todayAsUTC } from '../../lib/date.js';

const DAY_WIDTH = 42;
const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

// Todo en UTC, igual que el resto del sistema: las fechas se guardan como medianoche UTC y leerlas
// en local las corre un día hacia atrás en cualquier offset negativo (en Lima, UTC-5, el día 1
// aparecería como el 31 del mes anterior).
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function dayOfMonth(iso: string): number {
  return new Date(iso).getUTCDate();
}

function sameMonth(iso: string, year: number, month: number): boolean {
  const d = new Date(iso);
  return d.getUTCFullYear() === year && d.getUTCMonth() === month;
}

function before(iso: string, year: number, month: number): boolean {
  const d = new Date(iso);
  return d.getUTCFullYear() < year || (d.getUTCFullYear() === year && d.getUTCMonth() < month);
}

// La barra va de cuándo se creó la tarea a cuándo vence. No hay campo "fecha de inicio" y no hacía
// falta inventarlo: el momento en que alguien anotó la tarea ES cuando empezó a existir el trabajo.
//
// El orden importa: una tarea puede haberse anotado DESPUÉS de su propia fecha de vencimiento —
// pasa cada vez que alguien carga algo que ya estaba atrasado. Tomando createdAt como inicio a
// secas, el tramo daba negativo y la tarea desaparecía del mes en silencio, que es la peor forma de
// fallar: la vista se ve bien y falta trabajo. Por eso se ordenan los dos extremos.
//
// Devuelve null solo si el tramo de verdad no toca el mes que se está mirando.
function barRange(
  task: TaskDTO,
  year: number,
  month: number
): { start: number; span: number; cutLeft: boolean; cutRight: boolean } | null {
  const total = daysInMonth(year, month);
  const [from, to] =
    new Date(task.createdAt) <= new Date(task.dueDate)
      ? [task.createdAt, task.dueDate]
      : [task.dueDate, task.createdAt];

  const startsBefore = before(from, year, month);
  const endsAfter = !before(to, year, month) && !sameMonth(to, year, month);

  const start = startsBefore ? 1 : sameMonth(from, year, month) ? dayOfMonth(from) : null;
  const end = endsAfter ? total : sameMonth(to, year, month) ? dayOfMonth(to) : null;
  if (start === null || end === null) return null;

  return { start, span: Math.max(1, end - start + 1), cutLeft: startsBefore, cutRight: endsAfter };
}

export function TaskTimeline({ tasks, users }: { tasks: TaskDTO[]; users?: UserDTO[] }) {
  const today = todayAsUTC();
  const [cursor, setCursor] = useState({ year: today.getUTCFullYear(), month: today.getUTCMonth() });
  const total = daysInMonth(cursor.year, cursor.month);
  const days = Array.from({ length: total }, (_, i) => i + 1);
  const isCurrentMonth = today.getUTCFullYear() === cursor.year && today.getUTCMonth() === cursor.month;
  const todayDay = today.getUTCDate();

  const rows = tasks
    .map((task) => ({ task, range: barRange(task, cursor.year, cursor.month) }))
    .filter((row): row is { task: TaskDTO; range: NonNullable<ReturnType<typeof barRange>> } => row.range !== null);

  const move = (delta: number) => {
    const next = new Date(Date.UTC(cursor.year, cursor.month + delta, 1));
    setCursor({ year: next.getUTCFullYear(), month: next.getUTCMonth() });
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-3">
        <button
          onClick={() => move(-1)}
          aria-label="Mes anterior"
          className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-900"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-medium text-gray-900">
          {MONTHS[cursor.month]} {cursor.year}
        </span>
        <button
          onClick={() => move(1)}
          aria-label="Mes siguiente"
          className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-900"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <span className="ml-auto text-xs text-gray-400">
          {rows.length} {rows.length === 1 ? 'tarea' : 'tareas'} en el mes
        </span>
      </div>

      {/* El scroll horizontal vive acá adentro y no en la página: un mes de 31 días son 1300px y sin
          este contenedor el tablero estiraba el layout entero. */}
      <div className="overflow-x-auto">
        <div style={{ width: total * DAY_WIDTH }} className="relative min-w-full">
          <div className="flex border-b border-gray-100">
            {days.map((day) => (
              <div key={day} style={{ width: DAY_WIDTH }} className="shrink-0 py-2 text-center">
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                    isCurrentMonth && day === todayDay
                      ? 'bg-gray-900 font-medium text-white'
                      : 'text-gray-400'
                  }`}
                >
                  {day}
                </span>
              </div>
            ))}
          </div>

          {/* La línea de hoy cruza todas las filas: es la referencia que dice qué quedó atrás.
              absolute sobre el contenedor entero en vez de una marca por fila. */}
          {isCurrentMonth && (
            <div
              className="pointer-events-none absolute bottom-0 top-0 z-10 w-px bg-gray-900/20"
              style={{ left: (todayDay - 0.5) * DAY_WIDTH }}
            />
          )}

          {rows.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-gray-400">
              No hay tareas en {MONTHS[cursor.month].toLowerCase()}.
            </p>
          ) : (
            <div className="py-2">
              {rows.map(({ task, range }) => {
                const meta = STATUS_META[task.status];
                const overdue = isTaskOverdue(task);
                const width = range.span * DAY_WIDTH - 6;
                const left = (range.start - 1) * DAY_WIDTH + 3;
                // Una tarea de uno o dos días mide 40-80px: no entra ni media palabra, y recortarla
                // dejaba filas que eran solo un ícono. El umbral cuenta también el ícono, el aviso de vencida y
                // el avatar, que se comen unos 90px. Debajo de este ancho el título sale afuera de
                // la barra, al lado, donde sí se lee.
                const labelOutside = width < 200;
                return (
                  <div key={task.id} className="relative h-11">
                    {/* Las guías verticales van por fila para que se vea contra qué día cae la
                        barra sin tener que subir la vista al encabezado. */}
                    <div className="absolute inset-0 flex">
                      {days.map((day) => (
                        <div key={day} style={{ width: DAY_WIDTH }} className="shrink-0 border-r border-gray-50" />
                      ))}
                    </div>
                    <div
                      className="absolute top-1.5 flex h-8 items-center gap-2 overflow-hidden border bg-white px-2 shadow-sm transition-all duration-300"
                      style={{
                        left,
                        width,
                        // Punta recta del lado donde la barra se corta: avisa que el tramo sigue
                        // fuera del mes en vez de fingir que empieza o termina acá.
                        borderTopLeftRadius: range.cutLeft ? 0 : 9999,
                        borderBottomLeftRadius: range.cutLeft ? 0 : 9999,
                        borderTopRightRadius: range.cutRight ? 0 : 9999,
                        borderBottomRightRadius: range.cutRight ? 0 : 9999,
                        borderColor: overdue ? '#FCA5A5' : '#E5E7EB',
                      }}
                      title={`${task.title} · vence ${task.dueDate.slice(0, 10)}`}
                    >
                      <meta.icon className={`h-3.5 w-3.5 shrink-0 ${meta.dot}`} />
                      {!labelOutside && (
                        <>
                          <span
                            className={`truncate text-xs ${
                              task.status === 'DONE' ? 'text-gray-500 line-through' : 'text-gray-900'
                            }`}
                          >
                            {task.title}
                          </span>
                          <span className="ml-auto flex shrink-0 items-center gap-1.5">
                            {overdue && <span className="text-[10px] font-medium text-red-600">vencida</span>}
                            <OwnerAvatar ownerId={task.ownerId} users={users} />
                          </span>
                        </>
                      )}
                    </div>
                    {labelOutside && (
                      // pointer-events-none: la etiqueta flota sobre las guías de los días y no debe
                      // robarles el hover ni tapar la barra de al lado.
                      <div
                        className="pointer-events-none absolute top-1.5 flex h-8 items-center gap-1.5 whitespace-nowrap pl-2"
                        style={{ left: left + width }}
                      >
                        <span
                          className={`text-xs ${
                            task.status === 'DONE' ? 'text-gray-500 line-through' : 'text-gray-900'
                          }`}
                        >
                          {task.title}
                        </span>
                        {overdue && <span className="text-[10px] font-medium text-red-600">vencida</span>}
                        <OwnerAvatar ownerId={task.ownerId} users={users} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
