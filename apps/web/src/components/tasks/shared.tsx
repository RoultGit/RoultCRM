import { Circle, CircleCheck, CircleDashed } from 'lucide-react';
import { PRIORITY_LABEL, type TaskPriority } from '@roult/shared';
import type { TaskDTO, UserDTO } from '@roult/shared';
import { isOverdue as isDateOverdue } from '../../lib/date.js';

export const TASK_STATUS: { key: TaskDTO['status']; label: string; icon: typeof Circle; dot: string }[] = [
  { key: 'TODO', label: 'Por hacer', icon: Circle, dot: 'text-gray-400' },
  { key: 'DOING', label: 'En curso', icon: CircleDashed, dot: 'text-blue-500' },
  { key: 'DONE', label: 'Hecha', icon: CircleCheck, dot: 'text-emerald-600' },
];

export const STATUS_META = Object.fromEntries(TASK_STATUS.map((s) => [s.key, s])) as Record<
  TaskDTO['status'],
  (typeof TASK_STATUS)[number]
>;

/**
 * La escala de prioridades. Las cuatro llevan su color y su chip.
 *
 * La primera versión escondía Media (el valor por defecto) para que solo se viera lo que se sale de
 * lo normal. Pero dejaba una escalera rara: Baja mostraba chip y Media, que es más importante, no
 * mostraba nada. Entre "máximo silencio" y "orden coherente", gana el orden: una escala se lee por
 * comparación, y le falta un escalón cuando uno de sus niveles es invisible.
 *
 * El tinte llega hasta el borde de la card, no a su fondo: un fondo de color en cada tarjeta compite
 * con el texto. Y es el perímetro completo, no una barra de color a la izquierda, que es el recurso
 * más gastado de las plantillas.
 */
export const PRIORITY_STYLE: Record<TaskPriority, { chip: string; card: string; dot: string }> = {
  URGENT: { chip: 'bg-rose-100 text-rose-700', card: 'border-rose-200', dot: 'bg-rose-400' },
  HIGH: { chip: 'bg-amber-100 text-amber-700', card: 'border-amber-200', dot: 'bg-amber-400' },
  MEDIUM: { chip: 'bg-sky-50 text-sky-700', card: 'border-sky-200', dot: 'bg-sky-400' },
  LOW: { chip: 'bg-slate-100 text-slate-600', card: 'border-slate-200', dot: 'bg-slate-400' },
};

export function PriorityChip({ priority }: { priority: TaskPriority }) {
  const style = PRIORITY_STYLE[priority];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${style.chip}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {PRIORITY_LABEL[priority]}
    </span>
  );
}

// Una tarea vencida solo lo está mientras siga pendiente: una hecha tarde ya no es un problema, y
// pintarla de rojo para siempre convierte el rojo en ruido que se deja de mirar.
export function isTaskOverdue(task: TaskDTO): boolean {
  return task.status !== 'DONE' && isDateOverdue(task.dueDate);
}

// Iniciales en vez de foto: no hay avatares cargados en el sistema y un placeholder gris repetido
// en cada tarea no dice quién es. Dos letras sí.
export function OwnerAvatar({ ownerId, users }: { ownerId: string | null; users?: UserDTO[] }) {
  const owner = users?.find((user) => user.id === ownerId);
  if (!owner) return null;
  const initials = `${owner.firstName[0] ?? ''}${owner.lastName[0] ?? ''}`.toUpperCase();
  return (
    <span
      title={`${owner.firstName} ${owner.lastName}`}
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-900 text-[10px] font-medium text-white"
    >
      {initials}
    </span>
  );
}

// La barra de avance sirve para leerla de reojo, así que el número va al lado y no adentro: adentro
// se pierde contra el relleno cuando el avance es bajo. Al 0% no se dibuja nada — una barra vacía
// ocupa lugar y no dice nada que el "0%" no diga.
export function ProgressBar({ value, className }: { value: number; className?: string }) {
  const safe = Math.max(0, Math.min(100, value));
  return (
    <div className={`flex items-center gap-2 ${className ?? ''}`}>
      <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-gray-100">
        <div
          className={`h-full rounded-full transition-[width] duration-500 ease-out ${
            safe === 100 ? 'bg-emerald-600' : 'bg-gray-900'
          }`}
          style={{ width: `${safe}%` }}
          role="progressbar"
          aria-valuenow={safe}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
      <span className="shrink-0 text-[11px] tabular-nums text-gray-500">{safe}%</span>
    </div>
  );
}
