import { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { GitCommitHorizontal } from 'lucide-react';
import type { TaskDTO, UserDTO } from '@roult/shared';
import { Button } from '../ui/button.js';
import { useTaskUpdates, useAddTaskUpdate } from '../../hooks/useTaskUpdates.js';
import { OwnerAvatar, PriorityChip, ProgressBar } from './shared.js';

// "hace 3 días" en vez de una fecha: en un historial lo que importa es hace cuánto, no el día
// exacto. Se calcula en UTC como el resto del sistema.
function timeAgo(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'hoy';
  if (days === 1) return 'ayer';
  if (days < 30) return `hace ${days} días`;
  const months = Math.floor(days / 30);
  return months === 1 ? 'hace un mes' : `hace ${months} meses`;
}

/**
 * El avance de una tarea, con su historial.
 *
 * Un porcentaje suelto no dice nada: 70% puede significar "casi listo" o "trabado hace dos semanas".
 * Cada avance viene con lo que se hizo, quién lo hizo y cuándo, así que el número queda respaldado
 * por hechos y se puede leer para atrás cómo se movió.
 */
export function TaskProgressDialog({
  task,
  users,
  onClose,
}: {
  task: TaskDTO | null;
  users?: UserDTO[];
  onClose: () => void;
}) {
  const { data: updates, isLoading } = useTaskUpdates(task?.id ?? null);
  const addUpdate = useAddTaskUpdate(task?.id ?? null);
  const [note, setNote] = useState('');
  const [progress, setProgress] = useState(0);

  // Al abrir, el control arranca en el avance actual: lo más común es moverlo un poco desde donde
  // está, no escribirlo desde cero.
  useEffect(() => {
    if (!task) return;
    setNote('');
    setProgress(task.progress);
  }, [task?.id]);

  const nameOf = (id: string) => {
    const user = users?.find((u) => u.id === id);
    return user ? `${user.firstName} ${user.lastName}` : 'Alguien';
  };

  const canSubmit = note.trim().length > 0 && !addUpdate.isPending;

  return (
    <Dialog.Root open={!!task} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30" />
        <Dialog.Content className="focus:outline-none fixed left-1/2 top-1/2 flex max-h-[85vh] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl bg-white p-6 shadow-lg">
          <div className="mb-1 flex items-start gap-2">
            <Dialog.Title className="min-w-0 flex-1 text-lg font-semibold">{task?.title}</Dialog.Title>
            {task && <PriorityChip priority={task.priority} />}
          </div>
          {task && <ProgressBar value={task.progress} className="mb-4 mt-2" />}

          {/* ── registrar un avance ─────────────────────────────────────────── */}
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-600">¿Qué avanzaste?</span>
              <textarea
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                rows={2}
                placeholder="Ej. Maqueta terminada y aprobada por el cliente"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <label className="mt-3 block">
              <span className="mb-1 flex items-baseline justify-between text-xs font-medium text-gray-600">
                <span>¿En cuánto queda?</span>
                <span className="tabular-nums text-sm font-semibold text-gray-900">{progress}%</span>
              </span>
              {/* input range nativo: arrastrar, teclado y lectores de pantalla vienen de fábrica.
                  Reimplementarlo a mano es donde se pierde el soporte de teclado sin darse cuenta. */}
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={progress}
                onChange={(e) => setProgress(Number(e.target.value))}
                className="w-full accent-gray-900"
                aria-label="Porcentaje de avance"
              />
            </label>
            {addUpdate.isError && (
              <p className="mt-2 text-xs text-red-600">No se pudo registrar el avance.</p>
            )}
            <Button
              className="mt-3 w-full"
              size="sm"
              disabled={!canSubmit}
              onClick={() =>
                addUpdate.mutate({ note: note.trim(), progress }, { onSuccess: () => setNote('') })
              }
            >
              {addUpdate.isPending ? 'Registrando…' : 'Registrar avance'}
            </Button>
          </div>

          {/* ── historial ───────────────────────────────────────────────────── */}
          <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">Historial</h3>
            {isLoading ? (
              <p className="text-sm text-gray-400">Cargando…</p>
            ) : (updates ?? []).length === 0 ? (
              <p className="text-sm text-gray-400">
                Todavía no hay avances registrados. El primero queda acá arriba.
              </p>
            ) : (
              <ol className="space-y-3">
                {(updates ?? []).map((update, index) => (
                  <li key={update.id} className="flex gap-3">
                    {/* La línea vertical conecta los avances y hace que se lean como una secuencia
                        y no como una lista suelta. El último no la lleva: no hay nada más abajo. */}
                    <div className="flex flex-col items-center">
                      <GitCommitHorizontal className="h-4 w-4 shrink-0 text-gray-300" />
                      {index < (updates ?? []).length - 1 && <div className="w-px flex-1 bg-gray-100" />}
                    </div>
                    <div className="min-w-0 flex-1 pb-1">
                      <p className="text-sm text-gray-900">{update.note}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-gray-400">
                        <OwnerAvatar ownerId={update.authorId} users={users} />
                        {nameOf(update.authorId)} · {timeAgo(update.createdAt)} ·
                        <span className="font-medium text-gray-600">{update.progress}%</span>
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <Button variant="outline" className="mt-4 w-full" onClick={onClose}>
            Cerrar
          </Button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
