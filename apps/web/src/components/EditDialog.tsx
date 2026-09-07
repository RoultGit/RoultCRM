import { useState, useEffect, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useForm, type DefaultValues, type FieldValues } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { ZodTypeAny } from 'zod';
import { Button } from './ui/button.js';
import { useUsers } from '../hooks/useUsers.js';

export interface EditField {
  key: string;
  label: string;
  // 'time' usa el <input type="time"> nativo: el navegador ya da el formato de 24h, el teclado
  // correcto en móvil y devuelve exactamente el "HH:mm" que espera el schema.
  type?: 'text' | 'email' | 'date' | 'time' | 'number' | 'textarea';
  /** `vendedores` se llena solo con los usuarios del tenant. */
  options?: { value: string; label: string }[] | 'vendedores';
  /** Un select obligatorio (Línea, Moneda) no debe ofrecer la opción vacía. */
  allowEmpty?: boolean;
}

// Un solo diálogo para editar empresa, contacto, lead, deal, vendedor y tarea. Seis diálogos casi
// idénticos serían seis lugares donde arreglar el mismo detalle; este se maneja por una lista de
// campos y el schema de update que ya vive en @roult/shared.
export function EditDialog<T extends FieldValues>({
  title,
  fields,
  values,
  schema,
  isPending,
  isError,
  onSubmit,
  trigger,
}: {
  title: string;
  fields: EditField[];
  /** Valores actuales del registro; se recargan cada vez que se abre. */
  values: DefaultValues<T>;
  schema: ZodTypeAny;
  isPending?: boolean;
  isError?: boolean;
  onSubmit: (data: T, close: () => void) => void;
  /** Botón que abre el diálogo. Por defecto un "Editar" de contorno; en las cards del tablero se
   *  reemplaza por un ícono, porque diez botones iguales apilados tapan el contenido. */
  trigger?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const { data: users } = useUsers();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<T>({ resolver: zodResolver(schema), defaultValues: values });

  // Al reabrir hay que releer el registro: si no, el formulario muestra lo que había la primera vez
  // que se abrió, incluso después de que otra acción lo haya cambiado.
  useEffect(() => {
    if (open) reset(values);
  }, [open]);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm">
            Editar
          </Button>
        )}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30" />
        <Dialog.Content className="focus:outline-none fixed left-1/2 top-1/2 max-h-[85vh] w-full max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl bg-white p-6 shadow-lg">
          <Dialog.Title className="mb-4 text-lg font-semibold">{title}</Dialog.Title>
          <form className="space-y-3" onSubmit={handleSubmit((data) => onSubmit(data, () => setOpen(false)))}>
            {fields.map((field) => {
              const options =
                field.options === 'vendedores'
                  ? (users ?? []).map((u) => ({ value: u.id, label: `${u.firstName} ${u.lastName}` }))
                  : field.options;
              const className = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm';
              return (
                <label key={field.key} className="block">
                  <span className="mb-1 block text-xs font-medium text-gray-600">{field.label}</span>
                  {options ? (
                    <select className={className} {...register(field.key as never)}>
                      {field.allowEmpty && <option value="">Sin asignar</option>}
                      {options.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : field.type === 'textarea' ? (
                    <textarea className={className} rows={2} {...register(field.key as never)} />
                  ) : (
                    <input
                      className={className}
                      type={field.type ?? 'text'}
                      {...(field.type === 'number' ? { min: 0, max: 100, step: 1 } : {})}
                      {...register(field.key as never)}
                    />
                  )}
                </label>
              );
            })}
            {Object.values(errors).map((err, i) => (
              <p key={i} className="text-xs text-red-600">
                {(err as { message?: string })?.message}
              </p>
            ))}
            {isError && <p className="text-xs text-red-600">No se pudo guardar el cambio.</p>}
            <div className="flex gap-2 pt-1">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="flex-1" disabled={isPending}>
                {isPending ? 'Guardando…' : 'Guardar'}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
