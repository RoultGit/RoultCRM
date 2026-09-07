import { Circle, CircleCheck, CircleDashed } from 'lucide-react';
import type { TaskDTO, UserDTO } from '@ventry/shared';
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
