import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ArrowRight, Merge } from 'lucide-react';
import type { CompanyDTO } from '@roult/shared';
import { Button } from '../ui/button.js';
import { useCompanyOptions, } from '../../hooks/useCompanyOptions.js';
import { useMergeCompanies } from '../../hooks/useCompanies.js';

/**
 * Unir dos fichas del mismo cliente.
 *
 * El CRM ya avisaba de los duplicados pero no los podía unir, así que la única salida era borrar
 * una —perdiendo su historia— o convivir con las dos y que cada vendedor mirara la mitad.
 */
export function MergeCompaniesDialog({ company, onClose }: { company: CompanyDTO | null; onClose: () => void }) {
  const [otraId, setOtraId] = useState('');
  const { data: opciones } = useCompanyOptions();
  const fusionar = useMergeCompanies();

  if (!company) return null;
  const otras = (opciones ?? []).filter((o) => o.id !== company.id);
  const otra = otras.find((o) => o.id === otraId);
  const error = (fusionar.error as { response?: { data?: { error?: string } } } | null)?.response?.data?.error;

  return (
    <Dialog.Root open onOpenChange={(open) => !open && (onClose(), setOtraId(''))}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30" />
        <Dialog.Content className="focus:outline-none fixed left-1/2 top-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-lg">
          <Dialog.Title className="mb-1 text-lg font-semibold">Fusionar clientes</Dialog.Title>
          <p className="mb-4 text-sm text-gray-500">
            Todo lo de la ficha que elijas —contactos, ventas, cotizaciones, cobranza, archivos e
            historial— se pasa a <strong>{company.name}</strong>, y esa otra ficha desaparece.
          </p>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-600">Ficha que se absorbe</span>
            <select
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              value={otraId}
              onChange={(e) => setOtraId(e.target.value)}
            >
              <option value="">Elegí la ficha repetida</option>
              {otras.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>

          {otra && (
            <p className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-gray-50 p-3 text-sm">
              <span className="text-gray-600">{otra.name}</span>
              <ArrowRight className="h-4 w-4 text-gray-400" />
              <span className="font-medium text-gray-900">{company.name}</span>
            </p>
          )}

          <p className="mt-3 text-xs text-amber-700">
            Esto no se puede deshacer. Los datos que la ficha que queda tenga vacíos se completan con
            los de la otra.
          </p>

          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

          <div className="mt-4 flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              className="flex-1"
              disabled={!otraId || fusionar.isPending}
              onClick={() => fusionar.mutate({ keepId: company.id, mergeId: otraId }, { onSuccess: onClose })}
            >
              <Merge className="mr-1 h-4 w-4" />
              {fusionar.isPending ? 'Fusionando…' : 'Fusionar'}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
