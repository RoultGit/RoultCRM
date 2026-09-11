import { useState } from 'react';
import { Check, Pencil, X } from 'lucide-react';
import { type DealStage, type PipelineStageDTO } from '@roult/shared';
import { Card } from '../components/ui/card.js';
import { Button } from '../components/ui/button.js';
import { Badge } from '../components/ui/badge.js';
import { usePipelineStages, useUpdateStage } from '../hooks/usePipeline.js';
import { useSession } from '../hooks/useAuth.js';

const TONO: Record<PipelineStageDTO['meaning'], 'neutral' | 'success' | 'danger'> = {
  abierta: 'neutral',
  ganada: 'success',
  perdida: 'danger',
};
const SIGNIFICADO: Record<PipelineStageDTO['meaning'], string> = {
  abierta: 'En juego',
  ganada: 'Cuenta como ganada',
  perdida: 'Cuenta como perdida',
};

function Fila({ etapa, readOnly }: { etapa: PipelineStageDTO; readOnly: boolean }) {
  const update = useUpdateStage();
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState(etapa.label);

  const guardar = () => {
    const limpio = nombre.trim();
    if (!limpio || limpio === etapa.label) return setEditando(false);
    update.mutate({ stage: etapa.stage as DealStage, label: limpio }, { onSuccess: () => setEditando(false) });
  };

  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <span className="w-6 shrink-0 text-sm tabular-nums text-gray-400">{etapa.position + 1}</span>

      <div className="min-w-0 flex-1">
        {editando ? (
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm sm:w-56 sm:flex-none"
              value={nombre}
              autoFocus
              maxLength={40}
              onChange={(e) => setNombre(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') guardar();
                if (e.key === 'Escape') { setNombre(etapa.label); setEditando(false); }
              }}
            />
            <Button size="sm" className="px-2" aria-label="Guardar el nombre" onClick={guardar}>
              <Check className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="px-2"
              aria-label="Cancelar"
              onClick={() => { setNombre(etapa.label); setEditando(false); }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <p className={`text-sm font-medium ${etapa.enabled ? 'text-gray-900' : 'text-gray-400 line-through'}`}>
            {etapa.label}
          </p>
        )}
      </div>

      <Badge tone={TONO[etapa.meaning]}>{SIGNIFICADO[etapa.meaning]}</Badge>

      {!readOnly && !editando && (
        <div className="flex shrink-0 gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="px-2 text-gray-400 hover:text-gray-900"
            aria-label={`Renombrar ${etapa.label}`}
            onClick={() => { setNombre(etapa.label); setEditando(true); }}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={update.isPending || etapa.stage === 'PERDIDO'}
            title={etapa.stage === 'PERDIDO' ? 'Perdido no se puede esconder' : undefined}
            onClick={() => update.mutate({ stage: etapa.stage as DealStage, enabled: !etapa.enabled })}
          >
            {etapa.enabled ? 'Esconder' : 'Mostrar'}
          </Button>
        </div>
      )}
    </li>
  );
}

/**
 * Los nombres de las etapas, en el idioma de cada empresa.
 *
 * Lo que NO se puede cambiar es qué significa cada una para la plata: de ahí salen "ganado" y "en
 * juego". Si eso fuera configurable, dos empresas tendrían la misma pantalla contando cosas
 * distintas y nadie podría comparar nada.
 */
export function PipelinePage() {
  const { data: session } = useSession();
  const { data: etapas, isLoading } = usePipelineStages();
  const esAdmin = session?.role === 'ADMIN';
  const update = useUpdateStage();

  return (
    <div>
      <h1 className="text-xl font-semibold">Etapas del pipeline</h1>
      <p className="mb-4 mt-1 text-sm text-gray-500">
        {esAdmin
          ? 'Ponele a cada paso el nombre que usan en tu empresa, y escondé los que no te sirvan.'
          : 'Así se llaman los pasos del pipeline en esta empresa.'}
      </p>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          {isLoading ? (
            <p className="text-sm text-gray-400">Cargando…</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {(etapas ?? []).map((etapa) => (
                <Fila key={etapa.stage} etapa={etapa} readOnly={!esAdmin} />
              ))}
            </ul>
          )}
          {update.isError && (
            <p className="mt-3 text-xs text-red-600">
              {(update.error as { response?: { data?: { error?: string } } })?.response?.data?.error ??
                'No se pudo cambiar la etapa.'}
            </p>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-500">Qué se puede y qué no</h2>
          <p className="mb-3 text-sm text-gray-600">
            <strong>Se puede</strong> cambiarle el nombre a cualquier paso y esconder los que no uses.
            Una inmobiliaria le dice “Separación” a Adelanto y “Escriturado” a Entregado.
          </p>
          <p className="mb-3 text-sm text-gray-600">
            <strong>No se puede</strong> cambiar qué significa cada paso para la plata. De ahí salen
            “ganado” y “en juego” en el tablero de control: si eso se tocara, dos empresas tendrían
            la misma pantalla contando cosas distintas.
          </p>
          <p className="text-sm text-gray-600">
            Esconder no borra: las ventas que ya estén en ese paso siguen ahí y se pueden mover.
          </p>
        </Card>
      </div>
    </div>
  );
}
