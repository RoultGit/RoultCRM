import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createCompanySchema, type CompanyDTO } from '@ventry/shared';
import { z } from 'zod';
import { isAxiosError } from 'axios';
import { Button } from '../ui/button.js';
import { useCreateCompany } from '../../hooks/useCompanies.js';

const formSchema = createCompanySchema.omit({ confirmDuplicate: true });
type FormValues = z.infer<typeof formSchema>;

export function CreateCompanyDialog() {
  const [open, setOpen] = useState(false);
  const [duplicate, setDuplicate] = useState<CompanyDTO | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);

  const { register, handleSubmit, reset, getValues, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { line: 'WEB' },
  });
  const createCompany = useCreateCompany();

  const submit = (data: FormValues & { confirmDuplicate?: boolean }) => {
    createCompany.mutate(data, {
      onSuccess: () => {
        reset();
        setDuplicate(null);
        setBlocked(null);
        setOpen(false);
      },
      onError: (err) => {
        if (!isAxiosError(err) || err.response?.status !== 409) return;
        // Un 409 sin `details` es un duplicado de otro vendedor: el backend avisa del choque pero
        // no manda la ficha, así que acá no hay nada que ofrecer, solo el mensaje.
        const found = err.response.data.details?.duplicate as CompanyDTO | undefined;
        if (found) setDuplicate(found);
        else setBlocked(err.response.data.error as string);
      },
    });
  };

  const confirmAnyway = () => submit({ ...getValues(), confirmDuplicate: true });

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button>Agregar empresa</Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30" />
        <Dialog.Content className="focus:outline-none fixed left-1/2 top-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-lg">
          <Dialog.Title className="mb-4 text-lg font-semibold">Nueva empresa</Dialog.Title>
          {duplicate ? (
            <div className="space-y-3">
              <p className="text-sm text-amber-700">
                Ya existe una empresa parecida: <strong>{duplicate.name}</strong> ({duplicate.email ?? duplicate.whatsapp ?? 'sin contacto'}).
              </p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setDuplicate(null)}>Revisar de nuevo</Button>
                <Button className="flex-1" onClick={confirmAnyway} disabled={createCompany.isPending}>Crear de todas formas</Button>
              </div>
            </div>
          ) : (
            <form className="space-y-3" onSubmit={handleSubmit(submit)}>
              {blocked && <p className="text-sm text-amber-700">{blocked}</p>}
              <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="Nombre de la empresa" {...register('name')} />
              <select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" {...register('line')}>
                <option value="WEB">Web</option>
                <option value="SOFTWARE">Software</option>
              </select>
              <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="Correo (opcional)" type="email" {...register('email')} />
              <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="WhatsApp (opcional)" {...register('whatsapp')} />
              <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="Ciudad (opcional)" {...register('city')} />
              {Object.values(errors).map((err, i) => (
                <p key={i} className="text-xs text-red-600">{err?.message as string}</p>
              ))}
              <Button type="submit" className="w-full" disabled={createCompany.isPending}>
                {createCompany.isPending ? 'Creando…' : 'Crear empresa'}
              </Button>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
