import { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { isAxiosError } from 'axios';
import type { LeadDTO, CompanyDTO } from '@ventry/shared';
import { Button } from '../ui/button.js';
import { useConvertLead } from '../../hooks/useLeads.js';
import { formatMoney } from '../../lib/money.js';

// Calificar un lead es decir "esto es una venta real". En un paso deja de ser un prospecto y pasa a
// ser un cliente con una oportunidad en el pipeline. Antes había que convertir a mano y después ir a
// Deals a buscar la empresa, y se perdía el hilo entre el prospecto y la oportunidad.
export function QualifyLeadDialog({ lead, onClose }: { lead: LeadDTO | null; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<'PEN' | 'USD'>('PEN');
  const [duplicate, setDuplicate] = useState<CompanyDTO | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const convert = useConvertLead();

  useEffect(() => {
    if (!lead) return;
    // El título se propone solo con lo que ya sabemos, para no hacer escribir de más.
    setTitle(lead.line === 'WEB' ? `Web para ${lead.businessName}` : `Software para ${lead.businessName}`);
    setAmount('');
    setCurrency('PEN');
    setDuplicate(null);
    setBlocked(null);
  }, [lead?.id]);

  const submit = (confirmDuplicate = false) => {
    if (!lead) return;
    convert.mutate(
      { id: lead.id, confirmDuplicate, deal: { title: title.trim(), amount: amount.trim(), currency } },
      {
        onSuccess: onClose,
        onError: (err) => {
          if (!isAxiosError(err) || err.response?.status !== 409) return;
          const found = err.response.data.details?.duplicate as CompanyDTO | undefined;
          if (found) setDuplicate(found);
          else setBlocked(err.response.data.error as string);
        },
      }
    );
  };

  const amountValid = /^\d+(\.\d{1,2})?$/.test(amount.trim());
  const canSubmit = title.trim().length > 0 && amountValid && !convert.isPending;
  const field = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm';

  return (
    <Dialog.Root open={!!lead} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30" />
        <Dialog.Content className="focus:outline-none fixed left-1/2 top-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-lg">
          <Dialog.Title className="mb-1 text-lg font-semibold">Calificar y pasar a venta</Dialog.Title>
          <p className="mb-4 text-sm text-gray-500">
            <strong>{lead?.businessName}</strong> pasa a ser cliente y su oportunidad entra al pipeline.
          </p>

          {duplicate ? (
            <div className="space-y-3">
              <p className="text-sm text-amber-700">
                Ya existe un cliente parecido: <strong>{duplicate.name}</strong>. ¿Es el mismo o son distintos?
              </p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setDuplicate(null)}>
                  Revisar
                </Button>
                <Button className="flex-1" disabled={convert.isPending} onClick={() => submit(true)}>
                  Es otro, crear igual
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {blocked && <p className="text-sm text-amber-700">{blocked}</p>}
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-600">¿Qué le vas a vender?</span>
                <input className={field} value={title} onChange={(e) => setTitle(e.target.value)} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-600">¿Por cuánto?</span>
                <div className="flex gap-2">
                  <input
                    className={field}
                    placeholder="8000"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                  <select
                    className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value as 'PEN' | 'USD')}
                  >
                    <option value="PEN">PEN</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
              </label>
              {amount.trim() && !amountValid && (
                <p className="text-xs text-red-600">Escribí solo números, con hasta dos decimales. Ej: 8000 u 8000.50</p>
              )}
              {amountValid && (
                <p className="text-xs text-gray-500">Se creará por {formatMoney(amount.trim(), currency)}.</p>
              )}
              {convert.isError && !duplicate && !blocked && (
                <p className="text-xs text-red-600">No se pudo completar. Probá de nuevo.</p>
              )}
              <div className="flex gap-2 pt-1">
                <Button variant="outline" className="flex-1" onClick={onClose}>
                  Cancelar
                </Button>
                <Button className="flex-1" disabled={!canSubmit} onClick={() => submit()}>
                  {convert.isPending ? 'Creando…' : 'Crear cliente y venta'}
                </Button>
              </div>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
