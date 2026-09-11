import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as Dialog from '@radix-ui/react-dialog';
import { ArrowLeft, Coins, ListChecks, Handshake, Plus, Search, StickyNote } from 'lucide-react';
import { ACTIVITY_OPTIONS, type ActivityType } from '@roult/shared';
import { Button } from '../ui/button.js';
import { useCompanyOptions } from '../../hooks/useCompanyOptions.js';
import { useLogActivity } from '../../hooks/useActivities.js';

/**
 * Cargar algo desde la calle, en dos toques.
 *
 * El vendedor está en la puerta del cliente, no frente a una laptop. Si anotar una visita cuesta
 * abrir la computadora, no la anota nunca, y a las tres semanas el CRM está mintiendo. Por eso esto
 * vive en un botón flotante que solo aparece en pantallas chicas.
 */
export function QuickAdd() {
  const [open, setOpen] = useState(false);
  const [paso, setPaso] = useState<'menu' | 'anotar'>('menu');
  const navigate = useNavigate();

  const abrir = () => {
    setPaso('menu');
    setOpen(true);
  };

  const ir = (ruta: string) => {
    setOpen(false);
    navigate(ruta);
  };

  return (
    <>
      <button
        onClick={abrir}
        aria-label="Cargar algo"
        // Solo en el teléfono: en una pantalla grande el botón de cada sección ya está a la vista.
        // El bottom-20 lo levanta por encima de la barra del navegador móvil.
        className="fixed bottom-6 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-gray-900 text-white shadow-lg transition-transform active:scale-95 lg:hidden"
      >
        <Plus className="h-6 w-6" />
      </button>

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
          {/* Hoja desde abajo: es donde llega el pulgar sin reacomodar la mano. */}
          <Dialog.Content className="focus:outline-none fixed inset-x-0 bottom-0 z-50 max-h-[88vh] overflow-y-auto rounded-t-2xl bg-white p-5 pb-8 shadow-xl">
            {paso === 'menu' ? (
              <>
                <Dialog.Title className="mb-4 text-base font-semibold">¿Qué querés cargar?</Dialog.Title>
                <div className="space-y-2">
                  <Opcion
                    icon={StickyNote}
                    label="Anotar algo"
                    hint="Una llamada, una visita, lo que se habló"
                    onClick={() => setPaso('anotar')}
                  />
                  <Opcion icon={Handshake} label="Lead nuevo" hint="Alguien que preguntó" onClick={() => ir('/leads?nuevo=1')} />
                  <Opcion icon={ListChecks} label="Tarea nueva" hint="Algo que hay que hacer" onClick={() => ir('/tasks?nuevo=1')} />
                  <Opcion icon={Coins} label="Registrar un cobro" hint="Plata que entró" onClick={() => ir('/receivables')} />
                </div>
              </>
            ) : (
              <Anotar onListo={() => setOpen(false)} onVolver={() => setPaso('menu')} />
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

function Opcion({
  icon: Icon,
  label,
  hint,
  onClick,
}: {
  icon: typeof Plus;
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      // min-h-14: el mínimo para que un pulgar acierte sin errarle al de al lado.
      className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-gray-200 px-4 py-3 text-left transition-colors active:bg-gray-50"
    >
      <Icon className="h-5 w-5 shrink-0 text-gray-400" />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-gray-900">{label}</span>
        <span className="block text-xs text-gray-500">{hint}</span>
      </span>
    </button>
  );
}

function Anotar({ onListo, onVolver }: { onListo: () => void; onVolver: () => void }) {
  const { data: companies } = useCompanyOptions();
  const [empresa, setEmpresa] = useState<{ id: string; name: string } | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [tipo, setTipo] = useState<ActivityType>('CALL');
  const [texto, setTexto] = useState('');

  const log = useLogActivity(empresa ? { relatedType: 'COMPANY', relatedId: empresa.id } : null);

  const filtradas = (companies ?? [])
    .filter((c) => c.name.toLowerCase().includes(busqueda.trim().toLowerCase()))
    .slice(0, 8);

  if (!empresa) {
    return (
      <>
        <div className="mb-4 flex items-center gap-2">
          <button onClick={onVolver} aria-label="Volver" className="p-1 text-gray-400">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <Dialog.Title className="text-base font-semibold">¿Con quién?</Dialog.Title>
        </div>

        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            className="w-full rounded-xl border border-gray-200 py-3 pl-9 pr-3 text-base"
            placeholder="Buscar cliente"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>

        {/* Los últimos movidos arriba: el que se visitó hoy es casi siempre uno de esos. */}
        <div className="space-y-2">
          {filtradas.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-400">Ningún cliente con ese nombre.</p>
          ) : (
            filtradas.map((c) => (
              <button
                key={c.id}
                onClick={() => setEmpresa({ id: c.id, name: c.name })}
                className="flex min-h-14 w-full items-center rounded-xl border border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900 transition-colors active:bg-gray-50"
              >
                {c.name}
              </button>
            ))
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <div className="mb-4 flex items-center gap-2">
        <button onClick={() => setEmpresa(null)} aria-label="Cambiar de cliente" className="p-1 text-gray-400">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <Dialog.Title className="min-w-0 truncate text-base font-semibold">{empresa.name}</Dialog.Title>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {ACTIVITY_OPTIONS.map((opcion) => (
          <button
            key={opcion.value}
            onClick={() => setTipo(opcion.value)}
            aria-pressed={tipo === opcion.value}
            className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
              tipo === opcion.value ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'
            }`}
          >
            {opcion.label}
          </button>
        ))}
      </div>

      {/* Grande a propósito, y sin nada raro adentro: el micrófono del teclado del teléfono dicta
          acá sin que haga falta ninguna librería. */}
      <textarea
        className="mb-3 w-full rounded-xl border border-gray-200 p-3 text-base"
        rows={4}
        autoFocus
        placeholder="¿Qué pasó? Podés dictarlo con el micrófono del teclado."
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
      />

      {log.isError && <p className="mb-2 text-xs text-red-600">No se pudo guardar. Probá de nuevo.</p>}

      <Button
        className="min-h-12 w-full"
        disabled={!texto.trim() || log.isPending}
        onClick={() => log.mutate({ type: tipo, body: texto.trim() }, { onSuccess: onListo })}
      >
        {log.isPending ? 'Guardando…' : 'Guardar'}
      </Button>
    </>
  );
}
