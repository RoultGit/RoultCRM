import { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import type { DealDTO } from '@roult/shared';
import { Button } from '../ui/button.js';
import { useSetDealStage } from '../../hooks/useDeals.js';

export function LostReasonDialog({ deal, onClose }: { deal: DealDTO | null; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const setStage = useSetDealStage();

  useEffect(() => setReason(''), [deal?.id]);

  const submit = () => {
    if (!deal || !reason.trim()) return;
    setStage.mutate({ id: deal.id, stage: 'PERDIDO', lostReason: reason.trim() }, { onSuccess: onClose });
  };

  return (
    <Dialog.Root open={!!deal} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30" />
        <Dialog.Content className="focus:outline-none fixed left-1/2 top-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-lg">
          <Dialog.Title className="mb-2 text-lg font-semibold">Marcar deal como perdido</Dialog.Title>
          <p className="mb-4 text-sm text-gray-500">
            {deal?.title} — {deal?.companyName}. El deal no se elimina, queda registrado como perdido.
          </p>
          <textarea
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            rows={3}
            placeholder="Motivo de pérdida"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          {setStage.isError && <p className="mt-2 text-xs text-red-600">No se pudo marcar el deal como perdido.</p>}
          <div className="mt-4 flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>
              Cancelar
            </Button>
            <Button className="flex-1" disabled={!reason.trim() || setStage.isPending} onClick={submit}>
              Marcar perdido
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
