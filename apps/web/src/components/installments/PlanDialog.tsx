import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { PLAN_LABEL, type DealDTO, type InstallmentPlan } from '@roult/shared';
import { Button } from '../ui/button.js';
import { Badge } from '../ui/badge.js';
import { useInstallments, useGeneratePlan } from '../../hooks/useInstallments.js';
import { formatMoney } from '../../lib/money.js';
import { formatDate } from '../../lib/date.js';

/**
 * El estado de cuenta de una venta, y cómo armarlo.
 *
 * Rehacer el plan reemplaza lo que falta cobrar pero NO toca lo ya cobrado: la plata que entró no
 * puede desaparecer porque alguien apretó "generar" de nuevo.
 */
export function PlanDialog({ deal, onClose }: { deal: DealDTO | null; onClose: () => void }) {
  const { data: cuotas } = useInstallments(deal ? { dealId: deal.id } : {});
  const generar = useGeneratePlan();
  const [plan, setPlan] = useState<InstallmentPlan>('ADELANTO_SALDO');
  const [upfrontPct, setUpfront] = useState(50);
  const [balanceDays, setBalanceDays] = useState(30);
  const [count, setCount] = useState(3);

  if (!deal) return null;

  const cobradas = (cuotas ?? []).filter((c) => c.paidAt);
  const input = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm';
  const mensual = deal.billingType === 'MONTHLY';

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30" />
        <Dialog.Content className="focus:outline-none fixed left-1/2 top-1/2 max-h-[85vh] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl bg-white p-6 shadow-lg">
          <Dialog.Title className="text-lg font-semibold">Cobranza</Dialog.Title>
          <p className="mb-4 mt-1 text-sm text-gray-500">
            {deal.title} · {deal.companyName}
          </p>

          {(cuotas ?? []).length > 0 && (
            <ul className="mb-4 divide-y divide-gray-100 rounded-lg border border-gray-200">
              {(cuotas ?? []).map((cuota) => (
                <li key={cuota.id} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-gray-900">{cuota.concept}</p>
                    <p className="text-xs text-gray-500">vence {formatDate(cuota.dueDate)}</p>
                  </div>
                  <span className="shrink-0 text-sm tabular-nums text-gray-900">
                    {formatMoney(String(cuota.amount), cuota.currency)}
                  </span>
                  {cuota.paidAt ? (
                    <Badge tone="success">Cobrada</Badge>
                  ) : cuota.overdue ? (
                    <Badge tone="danger">Vencida</Badge>
                  ) : (
                    <Badge tone="neutral">Pendiente</Badge>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="space-y-3 border-t border-gray-100 pt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              {(cuotas ?? []).length > 0 ? 'Rehacer el plan' : 'Armar el plan'}
            </p>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-600">Cómo se cobra</span>
              <select className={input} value={plan} onChange={(e) => setPlan(e.target.value as InstallmentPlan)}>
                {(Object.keys(PLAN_LABEL) as InstallmentPlan[]).map((p) => (
                  <option key={p} value={p}>
                    {PLAN_LABEL[p]}
                  </option>
                ))}
              </select>
            </label>

            {plan === 'ADELANTO_SALDO' && (
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-gray-600">Adelanto %</span>
                  <input
                    className={input}
                    type="number"
                    min={1}
                    max={99}
                    value={upfrontPct}
                    onChange={(e) => setUpfront(Number(e.target.value))}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-gray-600">Saldo vence en (días)</span>
                  <input
                    className={input}
                    type="number"
                    min={0}
                    value={balanceDays}
                    onChange={(e) => setBalanceDays(Number(e.target.value))}
                  />
                </label>
              </div>
            )}

            {plan !== 'ADELANTO_SALDO' && (
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-600">Cuántas cuotas</span>
                <input
                  className={input}
                  type="number"
                  min={1}
                  max={60}
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                />
              </label>
            )}

            <p className="text-xs text-gray-500">
              {plan === 'MENSUAL'
                ? `Se cobran ${formatMoney(deal.amount, deal.currency)} cada mes.`
                : `Se reparte ${formatMoney(deal.amount, deal.currency)}${mensual ? ' por mes' : ''} entre las cuotas.`}
              {cobradas.length > 0 && ` Las ${cobradas.length} ya cobradas quedan como están.`}
            </p>

            {generar.isError && <p className="text-xs text-red-600">No se pudo armar el plan.</p>}

            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={onClose}>
                Cerrar
              </Button>
              <Button
                className="flex-1"
                disabled={generar.isPending}
                onClick={() =>
                  generar.mutate({ dealId: deal.id, plan, upfrontPct, balanceDays, count })
                }
              >
                {generar.isPending ? 'Armando…' : 'Armar plan'}
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
