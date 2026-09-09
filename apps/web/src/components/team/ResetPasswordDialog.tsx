import { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Check, Copy, KeyRound } from 'lucide-react';
import type { ResetPasswordDTO, UserDTO } from '@roult/shared';
import { Button } from '../ui/button.js';
import { useResetPassword } from '../../hooks/usePassword.js';

/**
 * Un admin le devuelve el acceso a alguien de su equipo.
 *
 * Dos pasos a propósito: primero se avisa qué va a pasar, después se muestra la contraseña. Un
 * botón que resetea de una hace que un click de más deje a una persona afuera de la app sin
 * entender por qué.
 */
export function ResetPasswordDialog({ user, onClose }: { user: UserDTO | null; onClose: () => void }) {
  const reset = useResetPassword();
  const [result, setResult] = useState<ResetPasswordDTO | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setResult(null);
    setCopied(false);
  }, [user?.id]);

  return (
    <Dialog.Root open={!!user} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30" />
        <Dialog.Content className="focus:outline-none fixed left-1/2 top-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-lg">
          {result ? (
            <>
              <Dialog.Title className="mb-2 text-lg font-semibold">Contraseña provisoria</Dialog.Title>
              <p className="mb-4 text-sm text-amber-700">
                Copiala ahora. No se guarda en ningún lado y no se puede volver a ver.
              </p>
              <div className="mb-4 space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-gray-500">Correo</span>
                  <span className="font-medium text-gray-900">{result.email}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-gray-500">Contraseña</span>
                  <span className="select-all font-mono text-gray-900">{result.temporaryPassword}</span>
                </div>
              </div>
              <p className="mb-4 text-sm text-gray-600">
                Al entrar con ella, la app le va a pedir que elija una propia antes de dejarlo seguir.
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() =>
                    navigator.clipboard
                      ?.writeText(`Correo: ${result.email}\nContraseña: ${result.temporaryPassword}`)
                      .then(
                        () => setCopied(true),
                        // Si el navegador bloquea el portapapeles, el texto está a la vista y es
                        // seleccionable: el botón no puede ser el único camino.
                        () => setCopied(false)
                      )
                  }
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? 'Copiado' : 'Copiar'}
                </Button>
                <Button className="flex-1" onClick={onClose}>
                  Ya la guardé
                </Button>
              </div>
            </>
          ) : (
            <>
              <Dialog.Title className="mb-2 text-lg font-semibold">Restablecer contraseña</Dialog.Title>
              <div className="mb-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
                <p className="text-sm font-medium text-gray-900">
                  {user?.firstName} {user?.lastName}
                </p>
                <p className="text-xs text-gray-500">{user?.email}</p>
              </div>
              <p className="mb-2 text-sm text-gray-600">
                Se genera una contraseña provisoria y se te muestra una sola vez, para que se la pases.
              </p>
              <p className="mb-4 text-sm text-gray-600">
                <strong>Se cierran todas sus sesiones abiertas.</strong> Si está usando la app en este
                momento, va a tener que volver a entrar.
              </p>
              {reset.isError && (
                <p className="mb-2 text-xs text-red-600">No se pudo restablecer la contraseña.</p>
              )}
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={onClose}>
                  Cancelar
                </Button>
                <Button
                  className="flex-1"
                  disabled={reset.isPending}
                  onClick={() => user && reset.mutate(user.id, { onSuccess: setResult })}
                >
                  <KeyRound className="h-4 w-4" />
                  {reset.isPending ? 'Generando…' : 'Restablecer'}
                </Button>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
