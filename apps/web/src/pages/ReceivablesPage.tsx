import { useState } from 'react';
import { Check, RotateCcw } from 'lucide-react';
import type { InstallmentDTO } from '@roult/shared';
import { Card } from '../components/ui/card.js';
import { Button } from '../components/ui/button.js';
import { Badge } from '../components/ui/badge.js';
import {
  useInstallments,
  useReceivableTotals,
  usePayInstallment,
  useUnpayInstallment,
} from '../hooks/useInstallments.js';
import { formatMoney } from '../lib/money.js';
import { formatDate } from '../lib/date.js';

const FILTROS = [
  { key: 'pending', label: 'Por cobrar' },
  { key: 'overdue', label: 'Vencido' },
  { key: 'paid', label: 'Cobrado' },
] as const;

/** Los totales, siempre separados por moneda: soles y dólares no se suman jamás. */
function Totales({ titulo, montos, tono }: { titulo: string; montos: Record<string, number>; tono?: string }) {
  const monedas = Object.keys(montos);
  return (
    <Card className="p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{titulo}</p>
      {monedas.length === 0 ? (
        <p className="mt-2 text-2xl font-semibold text-gray-300">—</p>
      ) : (
        <div className="mt-2 space-y-1">
          {monedas.map((moneda) => (
            <p key={moneda} className={`text-2xl font-semibold tabular-nums ${tono ?? 'text-gray-900'}`}>
              {formatMoney(String(montos[moneda]), moneda as 'PEN' | 'USD')}
            </p>
          ))}
        </div>
      )}
    </Card>
  );
}

function Cobrar({ cuota }: { cuota: InstallmentDTO }) {
  const [abierto, setAbierto] = useState(false);
  const [metodo, setMetodo] = useState('Transferencia');
  const [monto, setMonto] = useState(String(cuota.amount));
  const pagar = usePayInstallment();

  if (!abierto) {
    return (
      <Button size="sm" onClick={() => setAbierto(true)}>
        <Check className="mr-1 h-3.5 w-3.5" /> Cobré
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
        value={metodo}
        onChange={(e) => setMetodo(e.target.value)}
      >
        {['Transferencia', 'Yape / Plin', 'Efectivo', 'Tarjeta', 'Depósito'].map((m) => (
          <option key={m}>{m}</option>
        ))}
      </select>
      <input
        className="w-28 rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
        type="number"
        step="any"
        min={0}
        value={monto}
        aria-label="Monto que entró"
        onChange={(e) => setMonto(e.target.value)}
      />
      <Button
        size="sm"
        disabled={pagar.isPending}
        onClick={() =>
          pagar.mutate({ id: cuota.id, method: metodo, paidAmount: Number(monto) || undefined })
        }
      >
        {pagar.isPending ? 'Guardando…' : 'Confirmar'}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setAbierto(false)}>
        Cancelar
      </Button>
    </div>
  );
}

function Fila({ cuota }: { cuota: InstallmentDTO }) {
  const deshacer = useUnpayInstallment();
  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-900">
          {cuota.companyName} <span className="font-normal text-gray-500">· {cuota.concept}</span>
        </p>
        <p className="text-xs text-gray-500">
          {cuota.dealTitle} · vence {formatDate(cuota.dueDate)}
          {cuota.paidAt && ` · cobrado ${formatDate(cuota.paidAt)}`}
          {cuota.method && ` por ${cuota.method}`}
        </p>
      </div>

      <span className="shrink-0 text-sm font-medium tabular-nums text-gray-900">
        {formatMoney(String(cuota.paidAmount ?? cuota.amount), cuota.currency)}
      </span>

      {cuota.paidAt ? (
        <Badge tone="success">Cobrada</Badge>
      ) : cuota.overdue ? (
        <Badge tone="danger">Vencida</Badge>
      ) : (
        <Badge tone="neutral">Pendiente</Badge>
      )}

      <div className="shrink-0">
        {cuota.paidAt ? (
          <Button
            variant="ghost"
            size="sm"
            className="px-2 text-gray-400 hover:text-gray-900"
            aria-label={`Deshacer el cobro de ${cuota.concept}`}
            title="Se marcó por error"
            disabled={deshacer.isPending}
            onClick={() => deshacer.mutate(cuota.id)}
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        ) : (
          <Cobrar cuota={cuota} />
        )}
      </div>
    </li>
  );
}

export function ReceivablesPage() {
  const [status, setStatus] = useState<'pending' | 'overdue' | 'paid'>('pending');
  const { data: cuotas, isLoading } = useInstallments({ status });
  const { data: totales } = useReceivableTotals();

  return (
    <div>
      <h1 className="text-xl font-semibold">Cobranza</h1>
      <p className="mb-4 mt-1 text-sm text-gray-500">
        Qué falta cobrar, de quién y desde cuándo. El plan de cuotas se arma desde cada venta.
      </p>

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Totales titulo="Por cobrar" montos={totales?.pending ?? {}} />
        <Totales titulo="Vencido" montos={totales?.overdue ?? {}} tono="text-red-600" />
        <Totales titulo="Cobrado" montos={totales?.paid ?? {}} tono="text-emerald-700" />
      </div>

      <div className="mb-4 inline-flex flex-wrap rounded-lg border border-gray-200 bg-white p-0.5">
        {FILTROS.map((filtro) => (
          <button
            key={filtro.key}
            onClick={() => setStatus(filtro.key)}
            aria-pressed={status === filtro.key}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              status === filtro.key ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            {filtro.label}
          </button>
        ))}
      </div>

      <Card className="p-5">
        {isLoading ? (
          <p className="text-sm text-gray-400">Cargando…</p>
        ) : (cuotas ?? []).length === 0 ? (
          <p className="text-sm text-gray-400">
            {status === 'overdue'
              ? 'Nada vencido. Al día.'
              : status === 'paid'
                ? 'Todavía no hay cobros registrados.'
                : 'No hay nada por cobrar. El plan de cuotas se arma desde la venta.'}
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {(cuotas ?? []).map((cuota) => (
              <Fila key={cuota.id} cuota={cuota} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
