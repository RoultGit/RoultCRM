import { useState } from 'react';
import { Check, Settings2 } from 'lucide-react';
import {
  AUTOMATION_CATALOG,
  AUTOMATION_SPEC,
  describeAutomation,
  type AutomationCode,
  type AutomationDTO,
} from '@roult/shared';
import { Card } from '../components/ui/card.js';
import { Button } from '../components/ui/button.js';
import { useAutomations, useAutomationRuns, useUpdateAutomation } from '../hooks/useAutomations.js';
import { useSession } from '../hooks/useAuth.js';
import { formatDate } from '../lib/date.js';

/** El interruptor. Nativo por dentro para que el teclado y los lectores de pantalla lo entiendan. */
function Interruptor({
  on,
  onChange,
  label,
  disabled,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
        on ? 'bg-gray-900' : 'bg-gray-200'
      }`}
    >
      {/* `left-0` es obligatorio: sin él, el absolute se ancla en la posición estática que le
          daría el centrado del botón, y el traslado terminaba empujando el círculo fuera. */}
      <span
        className={`absolute left-0 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
          on ? 'translate-x-[22px]' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

function Fila({ spec, estado, readOnly }: { spec: (typeof AUTOMATION_CATALOG)[number]; estado: AutomationDTO; readOnly: boolean }) {
  const update = useUpdateAutomation();
  const [abierto, setAbierto] = useState(false);
  const [borrador, setBorrador] = useState<Record<string, string | number>>(estado.config);

  const sucio = spec.params.some((p) => String(borrador[p.key] ?? '') !== String(estado.config[p.key] ?? ''));

  return (
    <li className="py-4">
      <div className="flex items-start gap-3">
        {readOnly ? (
          <span
            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded ${
              estado.enabled ? 'bg-gray-900 text-white' : 'bg-gray-100'
            }`}
            aria-label={estado.enabled ? 'Prendida' : 'Apagada'}
          >
            {estado.enabled && <Check className="h-3.5 w-3.5" />}
          </span>
        ) : (
          <Interruptor
            on={estado.enabled}
            label={spec.name}
            disabled={update.isPending}
            onChange={(next) => update.mutate({ code: spec.code, enabled: next })}
          />
        )}

        <div className="min-w-0 flex-1">
          <p className={`text-sm font-medium ${estado.enabled ? 'text-gray-900' : 'text-gray-500'}`}>
            {spec.name}
            <span className="ml-2 text-xs font-normal text-gray-400">
              {spec.kind === 'EVENT' ? 'al instante' : 'cada mañana'}
            </span>
          </p>
          <p className="mt-0.5 text-sm text-gray-500">{describeAutomation(spec.code, estado.config)}</p>
        </div>

        {spec.params.length > 0 && !readOnly && (
          <Button
            variant="ghost"
            size="sm"
            className="px-2 text-gray-400 hover:text-gray-900"
            aria-label={`Ajustar ${spec.name}`}
            aria-expanded={abierto}
            onClick={() => { setBorrador(estado.config); setAbierto((v) => !v); }}
          >
            <Settings2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      {abierto && (
        <div className="ml-14 mt-3 flex flex-wrap items-end gap-3 rounded-lg bg-gray-50 p-3">
          {spec.params.map((param) => (
            <label key={param.key} className="block">
              <span className="mb-1 block text-xs font-medium text-gray-600">{param.label}</span>
              <input
                className="w-full min-w-0 rounded-lg border border-gray-200 px-3 py-1.5 text-sm sm:w-56"
                type={param.type === 'number' ? 'number' : 'text'}
                {...(param.type === 'number' ? { min: param.min, max: param.max } : {})}
                value={borrador[param.key] ?? ''}
                onChange={(e) =>
                  setBorrador((prev) => ({
                    ...prev,
                    [param.key]: param.type === 'number' ? Number(e.target.value) : e.target.value,
                  }))
                }
              />
            </label>
          ))}
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={!sucio || update.isPending}
              onClick={() => update.mutate({ code: spec.code, config: borrador }, { onSuccess: () => setAbierto(false) })}
            >
              {update.isPending ? 'Guardando…' : 'Guardar'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setAbierto(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

/**
 * Las automatizaciones de la empresa.
 *
 * Un catálogo cerrado con interruptores y no un constructor de reglas: quien maneja una ferretería
 * prende un interruptor, no arma un diagrama de flujo.
 */
export function AutomationsPage() {
  const { data: session } = useSession();
  const { data: automatizaciones, isLoading } = useAutomations();
  const { data: corridas } = useAutomationRuns();
  const esAdmin = session?.role === 'ADMIN';

  const porCodigo = new Map((automatizaciones ?? []).map((a) => [a.code as AutomationCode, a]));

  return (
    <div>
      <h1 className="text-xl font-semibold">Automatizaciones</h1>
      <p className="mb-4 mt-1 text-sm text-gray-500">
        {esAdmin
          ? 'Trabajo que el CRM hace solo, sin que nadie se acuerde. Prendé lo que te sirva y ajustá los números.'
          : 'Lo que el CRM hace solo. Por eso te aparecen tareas que no cargó nadie.'}
      </p>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          {isLoading ? (
            <p className="text-sm text-gray-400">Cargando…</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {AUTOMATION_CATALOG.map((spec) => {
                const estado = porCodigo.get(spec.code);
                if (!estado) return null;
                return <Fila key={spec.code} spec={spec} estado={estado} readOnly={!esAdmin} />;
              })}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-500">Lo último que hicieron</h2>
          {!corridas || corridas.length === 0 ? (
            <p className="text-sm text-gray-400">
              Todavía no hicieron nada. Las de “cada mañana” corren a las 8, las de “al instante”
              cuando pasa lo que esperan.
            </p>
          ) : (
            <ul className="space-y-3">
              {corridas.slice(0, 12).map((corrida, i) => (
                <li key={i} className="border-b border-gray-100 pb-3 last:border-0 last:pb-0">
                  <p className="text-sm text-gray-900">{corrida.detail}</p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {AUTOMATION_SPEC[corrida.code]?.name} · {formatDate(corrida.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
