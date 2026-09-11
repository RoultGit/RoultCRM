import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createUserSchema } from '@roult/shared';
import { z } from 'zod';
import { Button } from '../ui/button.js';
import { useCreateUser } from '../../hooks/useUsers.js';

// El rol entra en el formulario. Antes iba forzado a VENDEDOR, así que desde la app no había forma
// de crear un segundo administrador: el dueño de la empresa tenía que pedirlo por afuera.
const formSchema = createUserSchema;
type FormValues = z.infer<typeof formSchema>;

export function CreateVendedorDialog() {
  const [open, setOpen] = useState(false);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({ resolver: zodResolver(formSchema) });
  const createUser = useCreateUser();

  const onSubmit = (data: FormValues) => {
    createUser.mutate(
      data,
      {
        onSuccess: () => {
          reset();
          setOpen(false);
        },
      }
    );
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button>Agregar persona</Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30" />
        <Dialog.Content className="focus:outline-none fixed left-1/2 top-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-lg">
          <Dialog.Title className="mb-4 text-lg font-semibold">Alguien nuevo en el equipo</Dialog.Title>
          <form className="space-y-3" onSubmit={handleSubmit(onSubmit)}>
            <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="Nombre" {...register('firstName')} />
            <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="Apellido" {...register('lastName')} />
            <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="Correo" type="email" {...register('email')} />
            <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="Contraseña temporal" type="password" {...register('password')} />
            <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="Teléfono (opcional)" {...register('phone')} />
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-600">Qué puede hacer</span>
              <select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" defaultValue="VENDEDOR" {...register('role')}>
                <option value="VENDEDOR">Vendedor — solo lo suyo</option>
                <option value="ADMIN">Administrador — todo, y puede dar de alta gente</option>
              </select>
            </label>
            {Object.values(errors).map((err, i) => (
              <p key={i} className="text-xs text-red-600">{err?.message as string}</p>
            ))}
            {createUser.isError && (
              <p className="text-xs text-red-600">No se pudo crear el vendedor. Verifica que el correo no esté ya registrado.</p>
            )}
            <Button type="submit" className="w-full" disabled={createUser.isPending}>
              {createUser.isPending ? 'Creando…' : 'Crear cuenta'}
            </Button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
