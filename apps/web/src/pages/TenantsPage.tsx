import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { isAxiosError } from 'axios';
import { Check, Copy, Trash2 } from 'lucide-react';
import { createTenantSchema, type CreatedTenantDTO, type TenantDTO } from '@roult/shared';
import type { z } from 'zod';
import { Card } from '../components/ui/card.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { useSession } from '../hooks/useAuth.js';
import { useTenants, useCreateTenant } from '../hooks/useTenants.js';
import { useSuspendTenant, useDeleteTenant } from '../hooks/useSystem.js';
import { formatDate } from '../lib/date.js';

type FormValues = z.infer<typeof createTenantSchema>;

// La contraseña se ve UNA sola vez. No se guarda en claro en ningún lado, así que si esta pantalla
// se cierra sin copiarla, no se recupera: hay que crear la entidad de nuevo o cambiarla a mano.
function CredentialsPanel({ created, onClose }: { created: CreatedTenantDTO; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const text = `Entidad: ${created.tenant.name}\nCorreo: ${created.adminEmail}\nContraseña: ${created.temporaryPassword}`;

  return (
    <div>
      <Dialog.Title className="mb-2 text-lg font-semibold">Entidad creada</Dialog.Title>
      <p className="mb-4 text-sm text-amber-700">
        Copiá la contraseña ahora. No se guarda en ningún lado y no se puede volver a ver.
      </p>
      <div className="mb-4 space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
        <div className="flex justify-between gap-3">
          <span className="text-gray-500">Entidad</span>
          <span className="font-medium text-gray-900">{created.tenant.name}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-gray-500">Correo</span>
          <span className="font-medium text-gray-900">{created.adminEmail}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-gray-500">Contraseña</span>
          {/* tabular-nums y font-mono: una contraseña que se dicta o se transcribe necesita que la
              I y la l no se confundan. El generador ya evita los caracteres ambiguos. */}
          <span className="select-all font-mono text-gray-900">{created.temporaryPassword}</span>
        </div>
      </div>
      <div className="flex gap-2">
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => {
            navigator.clipboard?.writeText(text).then(
              () => setCopied(true),
              // Si el navegador bloquea el portapapeles, el texto igual está a la vista y es
              // seleccionable: el botón no puede ser el único camino.
              () => setCopied(false)
            );
          }}
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? 'Copiado' : 'Copiar todo'}
        </Button>
        <Button className="flex-1" onClick={onClose}>
          Ya la guardé
        </Button>
      </div>
    </div>
  );
}

function CreateTenantDialog() {
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState<CreatedTenantDTO | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const createTenant = useCreateTenant();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(createTenantSchema) });

  const close = () => {
    setOpen(false);
    setCreated(null);
    setBlocked(null);
    reset();
  };

  const submit = (data: FormValues) => {
    setBlocked(null);
    createTenant.mutate(data, {
      onSuccess: setCreated,
      onError: (err) => {
        // El 409 es el correo ya usado en otra entidad: es una regla, no una falla, y el mensaje
        // del servidor dice cuál es el correo.
        if (isAxiosError(err) && err.response?.status === 409) setBlocked(err.response.data.error as string);
      },
    });
  };

  const field = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm';

  return (
    <Dialog.Root open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
      <Dialog.Trigger asChild>
        <Button>Crear entidad</Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30" />
        <Dialog.Content className="focus:outline-none fixed left-1/2 top-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-lg">
          {created ? (
            <CredentialsPanel created={created} onClose={close} />
          ) : (
            <>
              <Dialog.Title className="mb-1 text-lg font-semibold">Nueva entidad</Dialog.Title>
              <p className="mb-4 text-sm text-gray-500">
                La empresa y su primer administrador se crean juntos. Sin ese admin, nadie podría
                entrar a la entidad.
              </p>
              <form className="space-y-3" onSubmit={handleSubmit(submit)}>
                <input className={field} placeholder="Nombre de la empresa" {...register('name')} />
                <div className="flex gap-2">
                  <input className={field} placeholder="Nombre del admin" {...register('adminFirstName')} />
                  <input className={field} placeholder="Apellido" {...register('adminLastName')} />
                </div>
                <input className={field} type="email" placeholder="Correo del admin" {...register('adminEmail')} />
                <p className="text-xs text-gray-500">
                  Un correo pertenece a una sola entidad. Si ya lo usás en otra empresa, hace falta uno
                  distinto.
                </p>
                {blocked && <p className="text-xs text-amber-700">{blocked}</p>}
                {Object.values(errors).map((err, i) => (
                  <p key={i} className="text-xs text-red-600">
                    {err?.message as string}
                  </p>
                ))}
                {createTenant.isError && !blocked && (
                  <p className="text-xs text-red-600">No se pudo crear la entidad.</p>
                )}
                <div className="flex gap-2 pt-1">
                  <Button type="button" variant="outline" className="flex-1" onClick={close}>
                    Cancelar
                  </Button>
                  <Button type="submit" className="flex-1" disabled={createTenant.isPending}>
                    {createTenant.isPending ? 'Creando…' : 'Crear entidad'}
                  </Button>
                </div>
              </form>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function TenantsPage() {
  const [aBorrar, setABorrar] = useState<TenantDTO | null>(null);
  const suspender = useSuspendTenant();
  const session = useSession();
  const isOwner = session.data?.isPlatformOwner === true;
  const { data: tenants, isLoading } = useTenants(isOwner);

  // El servidor ya responde 403; esto es para que la pantalla diga por qué en vez de quedar vacía.
  if (session.data && !isOwner) {
    return (
      <Card className="p-6 text-sm text-gray-500">
        Esta sección es solo para el dueño de la plataforma.
      </Card>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Entidades</h1>
          <p className="mt-1 text-sm text-gray-500">
            Cada entidad es una empresa con sus propios datos. Nada se comparte entre ellas.
          </p>
        </div>
        <CreateTenantDialog />
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="p-6 text-sm text-gray-500">Cargando…</div>
        ) : (tenants ?? []).length === 0 ? (
          <div className="p-6 text-sm text-gray-500">Todavía no hay entidades.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  <th className="px-4 py-3 font-medium text-gray-600">Empresa</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Usuarios</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Creada</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Estado</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {(tenants ?? []).map((tenant) => (
                  <tr key={tenant.id} className="border-b border-gray-100 last:border-0">
                    <td className="px-4 py-3 font-medium text-gray-900">{tenant.name}</td>
                    <td className="px-4 py-3 text-gray-600">{tenant.userCount}</td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(tenant.createdAt)}</td>
                    <td className="px-4 py-3">
                      <Badge tone={tenant.suspended ? 'danger' : 'success'}>
                        {tenant.suspended ? 'Suspendida' : 'Activa'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      {tenant.isOwn ? (
                        <span className="text-xs text-gray-400">Tu empresa</span>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={suspender.isPending}
                            onClick={() => suspender.mutate({ id: tenant.id, suspended: !tenant.suspended })}
                          >
                            {tenant.suspended ? 'Reactivar' : 'Suspender'}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="px-2 text-gray-400 hover:text-red-600"
                            aria-label={`Borrar ${tenant.name}`}
                            title="Borrar la entidad y todos sus datos"
                            onClick={() => setABorrar(tenant)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <BorrarEntidadDialog tenant={aBorrar} onClose={() => setABorrar(null)} />
    </div>
  );
}

/**
 * Borrar una empresa cliente.
 *
 * Pide el nombre exacto escrito a mano: el botón está al lado de los otros y una entidad borrada
 * por error no se recupera de ningún lado. Suspender es lo que hay que hacer casi siempre.
 */
function BorrarEntidadDialog({ tenant, onClose }: { tenant: TenantDTO | null; onClose: () => void }) {
  const [nombre, setNombre] = useState('');
  const borrar = useDeleteTenant();
  if (!tenant) return null;
  const error = (borrar.error as { response?: { data?: { error?: string } } } | null)?.response?.data?.error;

  return (
    <Dialog.Root open onOpenChange={(open) => !open && (onClose(), setNombre(''))}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30" />
        <Dialog.Content className="focus:outline-none fixed left-1/2 top-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-lg">
          <Dialog.Title className="mb-2 text-lg font-semibold">Borrar {tenant.name}</Dialog.Title>
          <p className="mb-3 text-sm text-gray-600">
            Se borran sus clientes, contactos, leads, ventas, cotizaciones, cobranza, tareas,
            archivos, historial y cuentas. <strong>No se puede deshacer.</strong>
          </p>
          <p className="mb-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
            Si dejó de pagar o se fue temporalmente, <strong>suspendela</strong> en vez de borrarla:
            nadie puede entrar pero los datos quedan.
          </p>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-600">
              Escribí «{tenant.name}» para confirmar
            </span>
            <input
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              value={nombre}
              autoFocus
              onChange={(e) => setNombre(e.target.value)}
            />
          </label>
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
          <div className="mt-4 flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              className="flex-1 bg-red-600 hover:bg-red-700"
              disabled={nombre.trim() !== tenant.name || borrar.isPending}
              onClick={() => borrar.mutate({ id: tenant.id, confirmName: nombre.trim() }, { onSuccess: onClose })}
            >
              {borrar.isPending ? 'Borrando…' : 'Borrar para siempre'}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
