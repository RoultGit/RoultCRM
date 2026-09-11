import { useState } from 'react';
import { Check, Copy, Mail } from 'lucide-react';
import { Card } from '../ui/card.js';
import { Button } from '../ui/button.js';
import { useInbox, useEnableInbox, useDisableInbox } from '../../hooks/useInbox.js';

/**
 * El buzón de la empresa: la dirección a la que se le manda copia oculta.
 *
 * Se eligió la copia oculta sobre conectar Gmail por OAuth porque OAuth pide un proyecto en Google
 * Cloud, verificación de la app y consentimiento de cada persona. Esto funciona con cualquier
 * casilla de cualquier proveedor y no hay que configurar nada en el correo del vendedor.
 */
export function InboxCard() {
  const { data: inbox } = useInbox();
  const activar = useEnableInbox();
  const desactivar = useDisableInbox();
  const [copiado, setCopiado] = useState(false);

  return (
    <Card className="p-5">
      <h2 className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-gray-500">
        <Mail className="h-3.5 w-3.5" /> Correo en la ficha
      </h2>

      {!inbox ? (
        <p className="text-sm text-gray-400">Cargando…</p>
      ) : !inbox.enabled ? (
        <>
          <p className="mb-3 text-sm text-gray-600">
            Para que los correos con tus clientes queden en su ficha, sin que nadie los copie a mano.
            Te damos una dirección y la ponés en copia oculta cuando escribís.
          </p>
          <Button disabled={activar.isPending} onClick={() => activar.mutate()}>
            {activar.isPending ? 'Activando…' : 'Activar el buzón'}
          </Button>
        </>
      ) : (
        <>
          <p className="mb-3 text-sm text-gray-600">
            Poné esta dirección en <strong>copia oculta</strong> cuando le escribas a un cliente, y
            el correo queda en su ficha. Si el cliente te escribe a vos, reenviá el mensaje dejándolo
            a él en copia.
          </p>

          <div className="mb-3 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg bg-gray-50 px-2.5 py-1.5 text-xs text-gray-700">
              {inbox.address}
            </code>
            <Button
              variant="outline"
              size="sm"
              className="px-2"
              aria-label="Copiar la dirección del buzón"
              onClick={() => {
                navigator.clipboard.writeText(inbox.address ?? '');
                setCopiado(true);
                setTimeout(() => setCopiado(false), 1500);
              }}
            >
              {copiado ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
          </div>

          {!inbox.ready && (
            <p className="mb-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
              Falta terminar de configurar la entrada de correo en el servidor. Hasta que esté, la
              dirección existe pero no recibe nada.
            </p>
          )}

          <p className="mb-3 text-xs text-gray-500">
            Si el que escribe no está cargado, se abre un lead con origen Correo. Así no se pierde
            nadie que preguntó.
          </p>

          <Button variant="outline" size="sm" disabled={desactivar.isPending} onClick={() => desactivar.mutate()}>
            Desactivar
          </Button>
        </>
      )}
    </Card>
  );
}
