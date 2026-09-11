import { useSearchParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { LINE_OPTIONS, BILLING_OPTIONS,createLeadSchema } from '@roult/shared';
import { z } from 'zod';
import { Button } from '../ui/button.js';
import { useCreateLead } from '../../hooks/useLeads.js';

type FormValues = z.infer<typeof createLeadSchema>;

export function CreateLeadDialog() {
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
            {/* Quien atiende el teléfono y quien firma no siempre son la misma persona. */}
            <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="Representante legal (opcional)" {...register('representativeName')} />
            <select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" {...register('line')}>
              {LINE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            {/* Si el prospecto es una suscripción, el deal que salga de él nace como suscripción. */}
            <select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" {...register('billingType')}>
              {BILLING_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
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
