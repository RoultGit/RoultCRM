import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createLeadSchema } from '@ventry/shared';
import { z } from 'zod';
import { Button } from '../ui/button.js';
import { useCreateLead } from '../../hooks/useLeads.js';

type FormValues = z.infer<typeof createLeadSchema>;

export function CreateLeadDialog() {
  const [open, setOpen] = useState(false);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(createLeadSchema),
    defaultValues: { line: 'WEB' },
  });
  const createLead = useCreateLead();

  const onSubmit = (data: FormValues) => {
    createLead.mutate(data, {
      onSuccess: () => {
        reset();
        setOpen(false);
      },
    });
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button>Agregar lead</Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30" />
        <Dialog.Content className="focus:outline-none fixed left-1/2 top-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-lg">
          <Dialog.Title className="mb-4 text-lg font-semibold">Nuevo lead</Dialog.Title>
          <form className="space-y-3" onSubmit={handleSubmit(onSubmit)}>
            <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="Empresa / persona" {...register('businessName')} />
            <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="Nombre de contacto" {...register('contactName')} />
            <select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" {...register('line')}>
              <option value="WEB">Web</option>
              <option value="SOFTWARE">Software</option>
            </select>
            <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="Correo (opcional)" type="email" {...register('email')} />
            <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="WhatsApp (opcional)" {...register('whatsapp')} />
            <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="Origen (opcional)" {...register('source')} />
            {Object.values(errors).map((err, i) => (
              <p key={i} className="text-xs text-red-600">{err?.message as string}</p>
            ))}
            <Button type="submit" className="w-full" disabled={createLead.isPending}>
              {createLead.isPending ? 'Creando…' : 'Crear lead'}
            </Button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
