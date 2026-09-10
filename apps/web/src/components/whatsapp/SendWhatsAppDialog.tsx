import { useState, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Button } from '../ui/button.js';
import { useSendWhatsApp } from '../../hooks/useWhatsApp.js';
import type { CustomFieldDTO } from '@roult/shared';

type RelatedType = CustomFieldDTO['entity'];

/**
 * Escribir por WhatsApp SIN salir del CRM.
 *
 * La diferencia con abrir wa.me no es la comodidad: por acá el mensaje queda anotado en la historia
 * del cliente. Un chat en el teléfono de un vendedor se va con el vendedor.
 */
export function SendWhatsAppDialog({
  to,
  relatedType,
  relatedId,
  trigger,
  greeting,
}: {
  to: string;
  relatedType: RelatedType;
  relatedId: string;
  trigger: ReactNode;
  greeting?: string;
}) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState(greeting ?? '');
  const send = useSendWhatsApp(relatedType, relatedId);
  const error = (send.error as { response?: { data?: { error?: string } } })?.response?.data?.error;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) { setBody(greeting ?? ''); send.reset(); }
      }}
    >
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30" />
        <Dialog.Content className="focus:outline-none fixed left-1/2 top-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-lg">
          <Dialog.Title className="text-lg font-semibold">Escribir por WhatsApp</Dialog.Title>
          <p className="mb-4 mt-1 text-sm text-gray-500">A {to}. Queda anotado en su historial.</p>
          <textarea
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            rows={4}
            autoFocus
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Hola, te escribo de…"
          />
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
          <div className="mt-4 flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              className="flex-1"
              disabled={!body.trim() || send.isPending}
              onClick={() =>
                send.mutate({ to, body: body.trim() }, { onSuccess: () => setOpen(false) })
              }
            >
              {send.isPending ? 'Enviando…' : 'Enviar'}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
