import { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { isAxiosError } from 'axios';
import type { CompanyDTO } from '@roult/shared';
import { Button } from '../ui/button.js';
import { useDeleteCompany } from '../../hooks/useCompanies.js';
import { useContactsPaged } from '../../hooks/useContacts.js';
import { firstPage } from '../../hooks/usePagedQuery.js';

// Eliminar una empresa arrastra cosas que no están a la vista en la fila de la tabla: sus contactos
// se van con ella. Se dice ANTES de borrar y con el número exacto, no después.
export function DeleteCompanyDialog({ company, onClose }: { company: CompanyDTO | null; onClose: () => void }) {
  const remove = useDeleteCompany();
  const { data: contacts } = useContactsPaged(firstPage, company?.id);
  const [blocked, setBlocked] = useState<string | null>(null);

  useEffect(() => setBlocked(null), [company?.id]);

  // El total viene del servidor filtrado por esta empresa. Antes se contaba sobre la lista
  // completa en memoria; con paginación eso contaría solo los de la primera página y el diálogo
  // diría que no hay contactos cuando sí los hay.
  const attached = contacts?.total ?? 0;

  const submit = () => {
    if (!company) return;
    remove.mutate(company.id, {
      onSuccess: onClose,
      onError: (err) => {
        // El 409 llega cuando la empresa tiene ventas: no es un fallo, es una regla. El mensaje del
        // servidor ya dice cuántas son, así que se muestra tal cual en vez de un "no se pudo".
        if (isAxiosError(err) && err.response?.status === 409) {
          setBlocked(err.response.data.error as string);
        }
      },
    });
  };

  return (
    <Dialog.Root open={!!company} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30" />
        <Dialog.Content className="focus:outline-none fixed left-1/2 top-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-lg">
          <Dialog.Title className="mb-2 text-lg font-semibold">Eliminar empresa</Dialog.Title>
          <div className="mb-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <p className="text-sm font-medium text-gray-900">{company?.name}</p>
            <p className="text-xs text-gray-500">
              {company?.city ?? 'Sin ciudad'} · {company?.email ?? company?.whatsapp ?? 'Sin contacto'}
            </p>
          </div>

          {blocked ? (
            <>
              <p className="mb-4 text-sm text-amber-700">{blocked}</p>
              <Button variant="outline" className="w-full" onClick={onClose}>
                Entendido
              </Button>
            </>
          ) : (
            <>
              <p className="mb-2 text-sm text-gray-600">
                Se elimina para siempre y no se puede deshacer. Queda registrado en Auditoría quién la
                eliminó y qué decía.
              </p>
              {attached > 0 && (
                <p className="mb-2 text-sm text-gray-600">
                  Se van también sus <strong>{attached} {attached === 1 ? 'contacto' : 'contactos'}</strong>: un
                  contacto no puede existir sin su empresa.
                </p>
              )}
              <p className="mb-4 text-sm text-gray-600">
                Si es un cliente que se perdió, no la elimines: marcá sus ventas como{' '}
                <strong>Perdidas</strong>, así el historial sigue contando.
              </p>
              {remove.isError && !blocked && (
                <p className="mb-2 text-xs text-red-600">No se pudo eliminar la empresa.</p>
              )}
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={onClose}>
                  Cancelar
                </Button>
                <Button variant="danger" className="flex-1" disabled={remove.isPending} onClick={submit}>
                  {remove.isPending ? 'Eliminando…' : 'Eliminar'}
                </Button>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
