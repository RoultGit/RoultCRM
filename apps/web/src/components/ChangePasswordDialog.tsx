import { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { isAxiosError } from 'axios';
import { Button } from './ui/button.js';
import { useChangePassword } from '../hooks/usePassword.js';

const MIN_LENGTH = 12;

/**
 * Cambiar la propia contraseña.
 *
 * `forced` cambia el tono, no las reglas: cuando la contraseña es provisoria, el diálogo no se puede
 * cerrar y no ofrece "Cancelar". Si se pudiera esquivar, la contraseña que se pasó por WhatsApp
 * quedaría viva y todo esto no serviría de nada.
 */
export function ChangePasswordDialog({
  open,
  forced = false,
  onClose,
}: {
  open: boolean;
  forced?: boolean;
  onClose: () => void;
}) {
  const change = useChangePassword();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setCurrent('');
    setNext('');
    setRepeat('');
    setFailed(null);
  }, [open]);

  const tooShort = next.length > 0 && next.length < MIN_LENGTH;
  const mismatch = repeat.length > 0 && next !== repeat;
  const same = next.length > 0 && next === current;
  const canSubmit =
    current.length > 0 && next.length >= MIN_LENGTH && next === repeat && !same && !change.isPending;

  const field = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm';

  const submit = () => {
    setFailed(null);
    change.mutate(
      { currentPassword: current, newPassword: next },
      {
        onSuccess: onClose,
        onError: (err) => {
          // 401 acá es "la actual no es correcta", no una sesión vencida: hay que decirlo, porque
          // el mensaje genérico manda a la gente a buscar el problema donde no está.
          setFailed(
            isAxiosError(err) && err.response?.status === 401
              ? 'La contraseña actual no es correcta.'
              : 'No se pudo cambiar la contraseña.'
          );
        },
      }
    );
  };

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && !forced && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30" />
        <Dialog.Content
          className="focus:outline-none fixed left-1/2 top-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-lg"
          // Sin esto, Escape o un click afuera cierran el diálogo obligatorio y dejan a la persona
          // adentro de la app con la contraseña provisoria intacta.
          onEscapeKeyDown={(e) => forced && e.preventDefault()}
          onPointerDownOutside={(e) => forced && e.preventDefault()}
          onInteractOutside={(e) => forced && e.preventDefault()}
        >
          <Dialog.Title className="mb-1 text-lg font-semibold">
            {forced ? 'Elegí tu contraseña' : 'Cambiar contraseña'}
          </Dialog.Title>
          <p className="mb-4 text-sm text-gray-500">
            {forced
              ? 'Estás usando una contraseña provisoria. Elegí una propia para seguir.'
              : 'Al cambiarla se cierran todas tus sesiones abiertas en otros dispositivos.'}
          </p>

          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-600">
                {forced ? 'Contraseña provisoria' : 'Contraseña actual'}
              </span>
              <input
                className={field}
                type="password"
                autoComplete="current-password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-600">Contraseña nueva</span>
              <input
                className={field}
                type="password"
                autoComplete="new-password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-600">Repetila</span>
              <input
                className={field}
                type="password"
                autoComplete="new-password"
                value={repeat}
                onChange={(e) => setRepeat(e.target.value)}
              />
            </label>

            {/* Los avisos salen mientras se escribe, no al enviar: enterarse de que faltaban
                caracteres después de mandar el formulario obliga a rehacerlo entero. */}
            {tooShort && (
              <p className="text-xs text-amber-700">Tiene que tener al menos {MIN_LENGTH} caracteres.</p>
            )}
            {same && <p className="text-xs text-amber-700">Tiene que ser distinta de la actual.</p>}
            {mismatch && <p className="text-xs text-amber-700">Las dos contraseñas no coinciden.</p>}
            {failed && <p className="text-xs text-red-600">{failed}</p>}

            <div className="flex gap-2 pt-1">
              {!forced && (
                <Button variant="outline" className="flex-1" onClick={onClose}>
                  Cancelar
                </Button>
              )}
              <Button className="flex-1" disabled={!canSubmit} onClick={submit}>
                {change.isPending ? 'Guardando…' : 'Guardar contraseña'}
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
