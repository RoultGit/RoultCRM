import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { BILLING_OPTIONS,createDealSchema } from '@roult/shared';
import { z } from 'zod';
import { Button } from '../ui/button.js';
import { useCreateDeal } from '../../hooks/useDeals.js';
import { useCompanyOptions } from '../../hooks/useCompanyOptions.js';
import { useUsers } from '../../hooks/useUsers.js';

type FormValues = z.infer<typeof createDealSchema>;

export function CreateDealDialog() {
  const [open, setOpen] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(createDealSchema),
    defaultValues: { currency: 'PEN' },
  });
  const createDeal = useCreateDeal();
  const { data: companies } = useCompanyOptions();
  const { data: users } = useUsers();

  const submit = (data: FormValues) =>
    createDeal.mutate(data, {
      onSuccess: () => {
        reset();
        setOpen(false);
      },
    });

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button>Agregar deal</Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30" />
        <Dialog.Content className="focus:outline-none fixed left-1/2 top-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-lg">
          <Dialog.Title className="mb-4 text-lg font-semibold">Nuevo deal</Dialog.Title>
          <form className="space-y-3" onSubmit={handleSubmit(submit)}>
            <select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" {...register('companyId')}>
              <option value="">Selecciona una empresa</option>
              {companies?.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
            <input
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              placeholder="Título (ej. Web corporativa)"
              {...register('title')}
            />
            <div className="flex gap-2">
              <input
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                placeholder="Monto (ej. 8000)"
                inputMode="decimal"
                {...register('amount')}
              />
              <select className="rounded-lg border border-gray-200 px-3 py-2 text-sm" {...register('currency')}>
                <option value="PEN">PEN</option>
                <option value="USD">USD</option>
              </select>
            </div>
            {/* En suscripción, el monto de arriba es lo que se cobra CADA MES, no el total. */}
            <select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" {...register('billingType')}>
              {BILLING_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <select
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              {...register('assignedUserId')}
            >
              <option value="">Sin vendedor asignado</option>
              {users?.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.firstName} {user.lastName}
                </option>
              ))}
            </select>
            {/* Los inputs de fecha son nativos: el navegador ya da calendario, formato y locale, y
                mandan exactamente el YYYY-MM-DD que espera z.string().date(). */}
            <input
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              type="date"
              title="Fecha estimada de cierre"
              {...register('expectedCloseDate')}
            />
            <input
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              placeholder="Próximo paso (opcional)"
              {...register('nextStepDescription')}
            />
            <div className="flex gap-2">
              {/* El próximo paso lleva descripción, responsable y fecha (spec de negocio, sección 16). */}
              <select
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                {...register('nextStepOwnerId')}
              >
                <option value="">Responsable del próximo paso</option>
                {users?.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.firstName} {user.lastName}
                  </option>
                ))}
              </select>
              <input
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                type="date"
                title="Fecha del próximo paso"
                {...register('nextStepDate')}
              />
            </div>
            {Object.values(errors).map((err, i) => (
              <p key={i} className="text-xs text-red-600">
                {err?.message as string}
              </p>
            ))}
            {createDeal.isError && <p className="text-xs text-red-600">No se pudo crear el deal.</p>}
            <Button type="submit" className="w-full" disabled={createDeal.isPending}>
              {createDeal.isPending ? 'Creando…' : 'Crear deal'}
            </Button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
