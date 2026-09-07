import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createContactSchema, type ContactDTO } from '@ventry/shared';
import { z } from 'zod';
import { isAxiosError } from 'axios';
import { Button } from '../ui/button.js';
import { useCreateContact } from '../../hooks/useContacts.js';
import { useCompanies } from '../../hooks/useCompanies.js';

const formSchema = createContactSchema.omit({ confirmDuplicate: true });
type FormValues = z.infer<typeof formSchema>;

export function CreateContactDialog() {
  const [open, setOpen] = useState(false);
  const [duplicate, setDuplicate] = useState<ContactDTO | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);

  const { data: companies } = useCompanies();
  const { register, handleSubmit, reset, getValues, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
  });
  const createContact = useCreateContact();

  const submit = (data: FormValues & { confirmDuplicate?: boolean }) => {
    createContact.mutate(data, {
      onSuccess: () => {
        reset();
        setDuplicate(null);
        setOpen(false);
      },
      onError: (err) => {
        if (!isAxiosError(err) || err.response?.status !== 409) return;
        // Un 409 sin `details` es un duplicado en la empresa de otro vendedor: hay choque, pero la
        // ficha no viaja, así que solo se muestra el mensaje.
        const found = err.response.data.details?.duplicate as ContactDTO | undefined;
        if (found) setDuplicate(found);
        else setBlocked(err.response.data.error as string);
      },
    });
  };

  const confirmAnyway = () => submit({ ...getValues(), confirmDuplicate: true });

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button>Agregar contacto</Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30" />
        <Dialog.Content className="focus:outline-none fixed left-1/2 top-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-lg">
          <Dialog.Title className="mb-4 text-lg font-semibold">Nuevo contacto</Dialog.Title>
          {duplicate ? (
            <div className="space-y-3">
              <p className="text-sm text-amber-700">
                Ya existe un contacto parecido en esa empresa: <strong>{duplicate.name}</strong>.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setDuplicate(null)}>Revisar de nuevo</Button>
                <Button className="flex-1" onClick={confirmAnyway} disabled={createContact.isPending}>Crear de todas formas</Button>
              </div>
            </div>
          ) : (
            <form className="space-y-3" onSubmit={handleSubmit(submit)}>
              {blocked && <p className="text-sm text-amber-700">{blocked}</p>}
              <select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" {...register('companyId')}>
                <option value="">Selecciona una empresa</option>
                {companies?.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="Nombre" {...register('name')} />
              <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="Cargo (opcional)" {...register('position')} />
              <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="Correo (opcional)" type="email" {...register('email')} />
              <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="Teléfono (opcional)" {...register('phone')} />
              {Object.values(errors).map((err, i) => (
                <p key={i} className="text-xs text-red-600">{err?.message as string}</p>
              ))}
              <Button type="submit" className="w-full" disabled={createContact.isPending}>
                {createContact.isPending ? 'Creando…' : 'Crear contacto'}
              </Button>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
