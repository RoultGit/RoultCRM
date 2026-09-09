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
 * La escala de prioridades, en un solo lugar.
 *
 * Decisión de diseño: NO todas las prioridades llevan color. Si las cuatro tienen el suyo, el color
 * deja de señalar y pasa a ser decoración — el ojo se acostumbra y ya no distingue. Así que Baja y
 * Media van en gris (recedan, que es lo que tienen que hacer) y solo Alta y Urgente se tiñen.
 *
 * El tinte llega hasta el borde de la card, no a su fondo: un fondo de color en cada tarjeta compite
 * con el texto y ensucia el tablero. Y el borde es de todo el perímetro, no una barra de color a la
 * izquierda, que es el recurso más gastado de las plantillas.
 */
export const PRIORITY_STYLE: Record<TaskPriority, { chip: string; card: string; dot: string }> = {
  URGENT: { chip: 'bg-rose-100 text-rose-700', card: 'border-rose-200', dot: 'bg-rose-400' },
  HIGH: { chip: 'bg-amber-100 text-amber-700', card: 'border-amber-200', dot: 'bg-amber-400' },
  MEDIUM: { chip: 'bg-sky-50 text-sky-700', card: 'border-gray-200', dot: 'bg-sky-300' },
  LOW: { chip: 'bg-gray-100 text-gray-600', card: 'border-gray-200', dot: 'bg-gray-300' },
};

export function PriorityChip({ priority }: { priority: TaskPriority }) {
  // Media no dibuja nada. Es el valor por defecto, así que aparecía en casi todas las tarjetas: una
  // etiqueta presente en el 80% de los casos no distingue nada, solo agrega un objeto más que leer.
  // Sin chip, "normal" es la ausencia de marca y lo que se ve es exactamente lo que se sale de lo
  // normal — que es para lo que sirve una prioridad.
  if (priority === 'MEDIUM') return null;
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
