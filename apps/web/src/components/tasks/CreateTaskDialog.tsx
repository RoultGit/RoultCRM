import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createTaskSchema } from '@ventry/shared';
import { z } from 'zod';
import { Button } from '../ui/button.js';
import { useCreateTask } from '../../hooks/useTasks.js';

type FormValues = z.infer<typeof createTaskSchema>;

export function CreateTaskDialog() {
  const [open, setOpen] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(createTaskSchema),
  });
  const createTask = useCreateTask();

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
