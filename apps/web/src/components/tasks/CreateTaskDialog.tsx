import { useSearchParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createTaskSchema, PRIORITY_OPTIONS } from '@roult/shared';
import { z } from 'zod';
import { Button } from '../ui/button.js';
import { useCreateTask } from '../../hooks/useTasks.js';
import { useUsers } from '../../hooks/useUsers.js';
import { useSession } from '../../hooks/useAuth.js';

type FormValues = z.infer<typeof createTaskSchema>;

export function CreateTaskDialog() {
  // Se abre solo cuando se llega desde el botón de carga rápida del teléfono: ahí el toque de
  // "Lead nuevo" ya expresó la intención, pedir otro toque más sería cobrarlo dos veces.
  const [searchParams, setSearchParams] = useSearchParams();
  const [open, setOpen] = useState(searchParams.get('nuevo') === '1');

  // El parámetro se borra apenas se leyó: es una instrucción de una sola vez. Si quedara en la
  // URL, cerrar el diálogo y volver atrás lo abriría de nuevo, para siempre.
  useEffect(() => {
    if (searchParams.get('nuevo')) {
      searchParams.delete('nuevo');
      setSearchParams(searchParams, { replace: true });
    }
  }, []);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(createTaskSchema),
    // Media por defecto: es lo neutro. Obligar a elegir prioridad en cada tarea agrega una decisión
    // a la acción más frecuente del sistema.
    defaultValues: { priority: 'MEDIUM' },
  });
  const createTask = useCreateTask();
  const { data: users } = useUsers();
  // Solo el admin elige destinatario. Un vendedor crea tareas para sí mismo y el backend lo obliga
  // igual, así que mostrarle un desplegable sería ofrecerle algo que no puede hacer.
  const isAdmin = useSession().data?.role === 'ADMIN';

  const submit = (data: FormValues) =>
    createTask.mutate(data, {
      onSuccess: () => {
        reset();
        setOpen(false);
      },
    });

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button>Agregar tarea</Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30" />
        <Dialog.Content className="focus:outline-none fixed left-1/2 top-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-lg">
          <Dialog.Title className="mb-4 text-lg font-semibold">Nueva tarea</Dialog.Title>
          <form className="space-y-3" onSubmit={handleSubmit(submit)}>
            <input
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              placeholder="¿Qué hay que hacer?"
              {...register('title')}
            />
            {isAdmin && (
              <select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" {...register('ownerId')}>
                <option value="">Para mí</option>
                {users?.map((user) => (
                  <option key={user.id} value={user.id}>
                    Para {user.firstName} {user.lastName}
                  </option>
                ))}
              </select>
            )}
            <select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" {...register('priority')}>
              {PRIORITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  Prioridad {o.label.toLowerCase()}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <input
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                type="date"
                title="Fecha límite"
                {...register('dueDate')}
              />
              {/* La hora es opcional: sin ella la tarea es de todo el día y el calendario la ubica
                  en la fila de arriba en vez de a una hora concreta. */}
              <input
                className="w-36 rounded-lg border border-gray-200 px-3 py-2 text-sm"
                type="time"
                title="Hora (opcional)"
                {...register('dueTime')}
              />
            </div>
            <textarea
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              rows={2}
              placeholder="Detalle (opcional)"
              {...register('description')}
            />
            {Object.values(errors).map((err, i) => (
              <p key={i} className="text-xs text-red-600">
                {err?.message as string}
              </p>
            ))}
            {createTask.isError && <p className="text-xs text-red-600">No se pudo crear la tarea.</p>}
            <Button type="submit" className="w-full" disabled={createTask.isPending}>
              {createTask.isPending ? 'Creando…' : 'Crear tarea'}
            </Button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
