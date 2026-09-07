import * as Dialog from '@radix-ui/react-dialog';
import type { DealDTO } from '@ventry/shared';
import { Button } from '../ui/button.js';
import { useDeleteDeal } from '../../hooks/useDeals.js';
import { formatMoney } from '../../lib/money.js';

// Borrar un deal no tiene deshacer, así que la confirmación muestra empresa, título y monto: es lo
// que deja ver que se está por borrar el deal equivocado antes de que sea tarde.
export function DeleteDealDialog({ deal, onClose }: { deal: DealDTO | null; onClose: () => void }) {
  const remove = useDeleteDeal();

  return (
    <Dialog.Root open={!!deal} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30" />
        <Dialog.Content className="fixed left-1/2 top-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-lg">
          <Dialog.Title className="mb-2 text-lg font-semibold">Eliminar deal</Dialog.Title>
          <div className="mb-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <p className="text-sm font-medium text-gray-900">{deal?.title}</p>
            <p className="text-xs text-gray-500">{deal?.companyName}</p>
            {deal && <p className="mt-1 text-sm font-semibold text-gray-900">{formatMoney(deal.amount, deal.currency)}</p>}
          </div>
          <p className="mb-1 text-sm text-gray-600">
            Se elimina para siempre y no se puede deshacer. Queda registrado en Auditoría quién lo
            eliminó y qué decía.
          </p>
          <p className="mb-4 text-sm text-gray-600">
            Si la venta no se cerró, no lo elimines: movelo a <strong>Perdido</strong>, así sigue
            contando en las métricas.
          </p>
          {remove.isError && <p className="mb-2 text-xs text-red-600">No se pudo eliminar el deal.</p>}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              className="flex-1"
              disabled={remove.isPending}
              onClick={() => deal && remove.mutate(deal.id, { onSuccess: onClose })}
            >
              {remove.isPending ? 'Eliminando…' : 'Eliminar'}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
