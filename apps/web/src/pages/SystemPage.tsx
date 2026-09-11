import { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import { Card } from '../components/ui/card.js';
import { Badge } from '../components/ui/badge.js';
import { useSystemErrors, type ErrorLogDTO } from '../hooks/useSystem.js';
import { useSession } from '../hooks/useAuth.js';
import { useTenants } from '../hooks/useTenants.js';

function Fila({ error, empresa }: { error: ErrorLogDTO; empresa: string }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <li className="py-3">
      <button
        className="flex w-full items-start gap-3 text-left"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
      >
        {abierto ? (
          <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
        ) : (
          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-gray-900">{error.message}</p>
          <p className="mt-0.5 text-xs text-gray-500">
            {error.method} {error.path} · {empresa} ·{' '}
            {new Date(error.createdAt).toLocaleString('es-PE')}
          </p>
        </div>
        <Badge tone="danger">{error.status}</Badge>
      </button>
      {abierto && error.stack && (
        <pre className="mt-2 overflow-x-auto rounded-lg bg-gray-900 p-3 text-xs leading-relaxed text-gray-100">
          {error.stack}
        </pre>
      )}
    </li>
  );
}

/**
 * Los errores del servidor.
 *
 * Sin esto, uno se entera de que algo se rompió cuando llama un cliente. No reemplaza a un
 * monitoreo de verdad —no hay alertas ni trazas— pero convierte "me enteré cuando me llamaron" en
 * "lo vi el mismo día".
 */
export function SystemPage() {
  const { data: session } = useSession();
  const esDueño = session?.isPlatformOwner === true;
  const { data: errores, isLoading } = useSystemErrors(esDueño);
  const { data: entidades } = useTenants(esDueño);

  const nombreEmpresa = (id: string | null) =>
    (entidades ?? []).find((t) => t.id === id)?.name ?? (id ? 'otra empresa' : 'sin sesión');

  if (!esDueño) {
    return (
      <Card className="p-6 text-sm text-gray-600">
        Esta pantalla es del dueño de la plataforma.
      </Card>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-semibold">Estado del sistema</h1>
      <p className="mb-4 mt-1 text-sm text-gray-500">
        Los errores del servidor de los últimos 30 días, del más reciente al más viejo. Se refresca
        solo cada minuto.
      </p>

      <Card className="p-5">
        {isLoading ? (
          <p className="text-sm text-gray-400">Cargando…</p>
        ) : !errores || errores.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-gray-500">
            <Badge tone="success">Sin errores</Badge>
            Nada se rompió en los últimos 30 días.
          </p>
        ) : (
          <>
            <p className="mb-3 flex items-center gap-2 text-sm text-gray-900">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              {errores.length} error{errores.length === 1 ? '' : 'es'} registrado
              {errores.length === 1 ? '' : 's'}
            </p>
            <ul className="divide-y divide-gray-100">
              {errores.map((error) => (
                <Fila key={error.id} error={error} empresa={nombreEmpresa(error.tenantId)} />
              ))}
            </ul>
          </>
        )}
      </Card>

      <p className="mt-3 text-xs text-gray-500">
        Esto no manda alertas: hay que entrar a mirarlo. Para avisos automáticos hace falta un
        servicio de monitoreo, que es otra cuenta y otra factura.
      </p>
    </div>
  );
}
