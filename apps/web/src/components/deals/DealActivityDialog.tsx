import * as Dialog from '@radix-ui/react-dialog';
import type { DealDTO } from '@roult/shared';
import { Button } from '../ui/button.js';
import { ActivityTimeline } from '../activities/ActivityTimeline.js';
import { formatAmount } from '../../lib/money.js';

// La historia de UNA venta, separada de la del cliente. Un cliente con tres ventas tiene tres hilos
// distintos, y mezclarlos obliga a leer todo para saber en qué quedó cada uno.
export function DealActivityDialog({ deal, onClose }: { deal: DealDTO | null; onClose: () => void }) {
  return (
    <Dialog.Root open={!!deal} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30" />
        <Dialog.Content className="focus:outline-none fixed left-1/2 top-1/2 flex max-h-[85vh] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl bg-white p-6 shadow-lg">
          <Dialog.Title className="text-lg font-semibold">{deal?.title}</Dialog.Title>
          <p className="mb-4 text-sm text-gray-500">
            {deal?.companyName} ·{' '}
            <span className="font-medium text-gray-900">
              {deal && formatAmount(deal.amount, deal.currency, deal.billingType)}
            </span>
          </p>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {deal && <ActivityTimeline relatedType="DEAL" relatedId={deal.id} title="Historial de esta venta" />}
          </div>
          <Button variant="outline" className="mt-4 w-full" onClick={onClose}>
            Cerrar
          </Button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
