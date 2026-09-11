import { useState, useEffect, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Plus, Trash2 } from 'lucide-react';
import { quoteTotals, type QuoteDTO } from '@roult/shared';
import { Button } from '../ui/button.js';
import { useCompanyOptions } from '../../hooks/useCompanyOptions.js';
import { useCreateQuote, useUpdateQuote } from '../../hooks/useQuotes.js';
import { formatMoney } from '../../lib/money.js';

interface Linea {
  description: string;
  quantity: number;
  unitPrice: number;
}

const LINEA_VACIA: Linea = { description: '', quantity: 1, unitPrice: 0 };

/**
 * Armar o corregir una cotización.
 *
 * Solo se puede editar mientras es borrador: cambiar los números de algo que el cliente ya tiene en
 * la mano haría que el total que ve él y el que ve el vendedor dejen de ser el mismo.
 */
export function QuoteDialog({
  trigger,
  quote,
  companyId,
  dealId,
}: {
  trigger: ReactNode;
  quote?: QuoteDTO;
  companyId?: string;
  dealId?: string;
}) {
  const [open, setOpen] = useState(false);
  const { data: companies } = useCompanyOptions();
  const create = useCreateQuote();
  const update = useUpdateQuote();
  const guardando = create.isPending || update.isPending;

  const [form, setForm] = useState({
    companyId: companyId ?? '',
    title: '',
    currency: 'PEN' as 'PEN' | 'USD',
    taxRate: 18,
    validUntil: '',
    notes: '',
    terms: '',
  });
  const [lineas, setLineas] = useState<Linea[]>([{ ...LINEA_VACIA }]);

  // Al reabrir hay que releer: si no, el formulario muestra lo que había la primera vez.
  useEffect(() => {
    if (!open) return;
    setForm({
      companyId: quote?.companyId ?? companyId ?? '',
      title: quote?.title ?? '',
      currency: quote?.currency ?? 'PEN',
      taxRate: quote?.taxRate ?? 18,
      validUntil: quote?.validUntil?.slice(0, 10) ?? '',
      notes: quote?.notes ?? '',
      terms: quote?.terms ?? '',
    });
    setLineas(
      quote?.items.length
        ? quote.items.map((i) => ({ description: i.description, quantity: i.quantity, unitPrice: i.unitPrice }))
        : [{ ...LINEA_VACIA }]
    );
  }, [open, quote?.id]);

  const totales = quoteTotals(lineas, form.taxRate);
  const valido = form.companyId && form.title.trim() && lineas.some((l) => l.description.trim() && l.quantity > 0);

  const input = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm';
  const setLinea = (i: number, campo: keyof Linea, valor: string | number) =>
    setLineas((prev) => prev.map((l, idx) => (idx === i ? { ...l, [campo]: valor } : l)));

  const guardar = () => {
    const limpias = lineas.filter((l) => l.description.trim());
    const payload = {
      title: form.title.trim(),
      currency: form.currency,
      taxRate: form.taxRate,
      validUntil: form.validUntil || undefined,
      notes: form.notes.trim() || undefined,
      terms: form.terms.trim() || undefined,
      items: limpias,
    };
    if (quote) update.mutate({ id: quote.id, ...payload }, { onSuccess: () => setOpen(false) });
    else create.mutate({ companyId: form.companyId, dealId, ...payload }, { onSuccess: () => setOpen(false) });
  };

  const error = (create.error ?? update.error) as { response?: { data?: { error?: string } } } | null;

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30" />
        <Dialog.Content className="focus:outline-none fixed left-1/2 top-1/2 max-h-[88vh] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl bg-white p-6 shadow-lg">
          <Dialog.Title className="mb-4 text-lg font-semibold">
            {quote ? `Cotización ${quote.number}` : 'Cotización nueva'}
          </Dialog.Title>

          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-600">Cliente</span>
                <select
                  className={input}
                  value={form.companyId}
                  disabled={!!quote || !!companyId}
                  onChange={(e) => setForm((p) => ({ ...p, companyId: e.target.value }))}
                >
                  <option value="">Elegí el cliente</option>
                  {(companies ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-600">Título</span>
                <input
                  className={input}
                  placeholder="Ej. Sitio web institucional"
                  value={form.title}
                  onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                />
              </label>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-600">Moneda</span>
                <select
                  className={input}
                  value={form.currency}
                  onChange={(e) => setForm((p) => ({ ...p, currency: e.target.value as 'PEN' | 'USD' }))}
                >
                  <option value="PEN">Soles (S/)</option>
                  <option value="USD">Dólares ($)</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-600">IGV %</span>
                <input
                  className={input}
                  type="number"
                  min={0}
                  max={100}
                  step={0.01}
                  value={form.taxRate}
                  onChange={(e) => setForm((p) => ({ ...p, taxRate: Number(e.target.value) }))}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-600">Válida hasta</span>
                <input
                  className={input}
                  type="date"
                  value={form.validUntil}
                  onChange={(e) => setForm((p) => ({ ...p, validUntil: e.target.value }))}
                />
              </label>
            </div>

            <div className="border-t border-gray-100 pt-3">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">Qué se cotiza</p>
              <div className="space-y-2">
                {lineas.map((linea, i) => (
                  <div key={i} className="flex flex-wrap items-end gap-2">
                    <label className="min-w-0 flex-1">
                      <span className="sr-only">Descripción</span>
                      <input
                        className={input}
                        placeholder="Ej. Diseño de páginas internas"
                        value={linea.description}
                        onChange={(e) => setLinea(i, 'description', e.target.value)}
                      />
                    </label>
                    <label className="w-20">
                      <span className="mb-1 block text-xs text-gray-500">Cant.</span>
                      <input
                        className={input}
                        type="number"
                        min={0}
                        step="any"
                        value={linea.quantity}
                        onChange={(e) => setLinea(i, 'quantity', Number(e.target.value))}
                      />
                    </label>
                    <label className="w-28">
                      <span className="mb-1 block text-xs text-gray-500">Precio</span>
                      <input
                        className={input}
                        type="number"
                        min={0}
                        step="any"
                        value={linea.unitPrice}
                        onChange={(e) => setLinea(i, 'unitPrice', Number(e.target.value))}
                      />
                    </label>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="px-2 text-gray-400 hover:text-red-600"
                      aria-label={`Quitar línea ${i + 1}`}
                      disabled={lineas.length === 1}
                      onClick={() => setLineas((prev) => prev.filter((_, idx) => idx !== i))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => setLineas((prev) => [...prev, { ...LINEA_VACIA }])}
              >
                <Plus className="mr-1 h-4 w-4" /> Agregar línea
              </Button>
            </div>

            <div className="flex justify-end border-t border-gray-100 pt-3">
              <dl className="w-full space-y-1 text-sm sm:w-64">
                <div className="flex justify-between">
                  <dt className="text-gray-500">Subtotal</dt>
                  <dd className="tabular-nums">{formatMoney(String(totales.subtotal), form.currency)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">IGV {form.taxRate}%</dt>
                  <dd className="tabular-nums">{formatMoney(String(totales.tax), form.currency)}</dd>
                </div>
                <div className="flex justify-between border-t border-gray-100 pt-1 font-semibold text-gray-900">
                  <dt>Total</dt>
                  <dd className="tabular-nums">{formatMoney(String(totales.total), form.currency)}</dd>
                </div>
              </dl>
            </div>

            <div className="grid grid-cols-1 gap-3 border-t border-gray-100 pt-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-600">Notas para el cliente</span>
                <textarea
                  className={input}
                  rows={3}
                  value={form.notes}
                  onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-600">Condiciones</span>
                <textarea
                  className={input}
                  rows={3}
                  placeholder="Ej. 50% de adelanto, saldo contra entrega. Plazo: 30 días."
                  value={form.terms}
                  onChange={(e) => setForm((p) => ({ ...p, terms: e.target.value }))}
                />
              </label>
            </div>

            {error && (
              <p className="text-xs text-red-600">
                {error.response?.data?.error ?? 'No se pudo guardar la cotización.'}
              </p>
            )}

            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button className="flex-1" disabled={!valido || guardando} onClick={guardar}>
                {guardando ? 'Guardando…' : quote ? 'Guardar cambios' : 'Crear cotización'}
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
