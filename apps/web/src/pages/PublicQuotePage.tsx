import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Check, Printer, X } from 'lucide-react';
import { QUOTE_STATUS_LABEL } from '@roult/shared';
import { usePublicQuote, useRespondQuote } from '../hooks/useQuotes.js';
import { formatMoney } from '../lib/money.js';
import { formatDate } from '../lib/date.js';

/**
 * La cotización como la ve el cliente.
 *
 * Sin sesión y sin cuenta: se abre desde un link. Por eso cuelga fuera del AppShell y no muestra
 * nada del CRM — ni menú, ni nombres del equipo, ni otros clientes.
 */
export function PublicQuotePage() {
  const { token } = useParams<{ token: string }>();
  const { data: quote, isLoading, isError } = usePublicQuote(token);
  const responder = useRespondQuote(token);
  const [nombre, setNombre] = useState('');
  const [eligiendo, setEligiendo] = useState<'accept' | 'reject' | null>(null);

  if (isLoading) {
    return <p className="p-8 text-center text-sm text-gray-500">Cargando la cotización…</p>;
  }

  if (isError || !quote) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-lg font-semibold text-gray-900">No encontramos esta cotización</h1>
        <p className="mt-2 text-sm text-gray-500">
          El link puede estar incompleto o la cotización pudo haberse dado de baja. Pedile al vendedor
          que te mande el link de nuevo.
        </p>
      </div>
    );
  }

  const error = (responder.error as { response?: { data?: { error?: string } } })?.response?.data?.error;
  const yaRespondio = quote.status === 'ACCEPTED' || quote.status === 'REJECTED';

  return (
    <div className="min-h-screen bg-gray-50 py-8 print:bg-white print:py-0">
      <div className="mx-auto max-w-3xl px-4 print:max-w-none print:px-0">
        <div className="rounded-xl bg-white p-6 shadow-sm print:rounded-none print:p-0 print:shadow-none sm:p-10">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-200 pb-6">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Cotización {quote.number}</p>
              <h1 className="mt-1 text-2xl font-semibold text-gray-900">{quote.title}</h1>
              <p className="mt-2 text-sm text-gray-600">
                De <span className="font-medium text-gray-900">{quote.vendorName}</span> para{' '}
                <span className="font-medium text-gray-900">{quote.companyName}</span>
              </p>
            </div>
            <div className="text-sm text-gray-500 sm:text-right">
              <p>{formatDate(quote.createdAt)}</p>
              {quote.validUntil && <p className="mt-1">Válida hasta {formatDate(quote.validUntil)}</p>}
              {yaRespondio && (
                <p className="mt-2 font-medium text-gray-900">{QUOTE_STATUS_LABEL[quote.status]}</p>
              )}
            </div>
          </div>

          {/* Filas y no una tabla: una tabla con cuatro columnas no entra en un teléfono, y el
              cliente abre esto del teléfono. Cortarle las columnas de precio es cortarle justo lo
              que vino a mirar. */}
          <ul className="divide-y divide-gray-100 py-6">
            {quote.items.map((item, i) => (
              <li key={i} className="flex items-baseline justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm text-gray-900">{item.description}</p>
                  <p className="mt-0.5 text-xs tabular-nums text-gray-500">
                    {item.quantity} × {formatMoney(String(item.unitPrice), quote.currency)}
                  </p>
                </div>
                <span className="shrink-0 text-sm tabular-nums text-gray-900">
                  {formatMoney(String(item.lineTotal), quote.currency)}
                </span>
              </li>
            ))}
          </ul>

          <div className="flex justify-end">
            <dl className="w-full space-y-1.5 text-sm sm:w-72">
              <div className="flex justify-between">
                <dt className="text-gray-500">Subtotal</dt>
                <dd className="tabular-nums text-gray-900">{formatMoney(String(quote.subtotal), quote.currency)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">IGV {quote.taxRate}%</dt>
                <dd className="tabular-nums text-gray-900">{formatMoney(String(quote.tax), quote.currency)}</dd>
              </div>
              <div className="flex justify-between border-t border-gray-200 pt-1.5 text-base font-semibold text-gray-900">
                <dt>Total</dt>
                <dd className="tabular-nums">{formatMoney(String(quote.total), quote.currency)}</dd>
              </div>
            </dl>
          </div>

          {(quote.notes || quote.terms) && (
            <div className="mt-8 grid grid-cols-1 gap-6 border-t border-gray-200 pt-6 sm:grid-cols-2">
              {quote.notes && (
                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">Notas</p>
                  <p className="whitespace-pre-wrap text-sm text-gray-600">{quote.notes}</p>
                </div>
              )}
              {quote.terms && (
                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">Condiciones</p>
                  <p className="whitespace-pre-wrap text-sm text-gray-600">{quote.terms}</p>
                </div>
              )}
            </div>
          )}

          {/* La respuesta no se imprime: en el papel no se aprieta nada. */}
          <div className="mt-8 border-t border-gray-200 pt-6 print:hidden">
            {yaRespondio ? (
              <p className="text-sm text-gray-600">
                {quote.respondedBy} ya {quote.status === 'ACCEPTED' ? 'aceptó' : 'rechazó'} esta
                cotización. Si necesitás cambiar algo, hablá con {quote.vendorName}.
              </p>
            ) : !quote.canRespond ? (
              <p className="text-sm text-amber-700">
                Esta cotización venció. Pedile a {quote.vendorName} que te mande una nueva.
              </p>
            ) : (
              <>
                <p className="mb-3 text-sm font-medium text-gray-900">¿Avanzamos con esto?</p>
                {eligiendo === null ? (
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setEligiendo('accept')}
                      className="flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-800"
                    >
                      <Check className="h-4 w-4" /> Aceptar la cotización
                    </button>
                    <button
                      onClick={() => setEligiendo('reject')}
                      className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
                    >
                      <X className="h-4 w-4" /> No por ahora
                    </button>
                  </div>
                ) : (
                  <div className="max-w-sm space-y-3">
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-gray-600">¿Quién responde?</span>
                      <input
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                        placeholder="Tu nombre y apellido"
                        autoFocus
                        value={nombre}
                        onChange={(e) => setNombre(e.target.value)}
                      />
                    </label>
                    {error && <p className="text-xs text-red-600">{error}</p>}
                    <div className="flex gap-2">
                      <button
                        className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600"
                        onClick={() => setEligiendo(null)}
                      >
                        Volver
                      </button>
                      <button
                        disabled={!nombre.trim() || responder.isPending}
                        onClick={() => responder.mutate({ accept: eligiendo === 'accept', respondedBy: nombre.trim() })}
                        className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                      >
                        {responder.isPending
                          ? 'Enviando…'
                          : eligiendo === 'accept'
                            ? 'Confirmar que la acepto'
                            : 'Confirmar que no'}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <button
          onClick={() => window.print()}
          className="mx-auto mt-4 flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 print:hidden"
        >
          <Printer className="h-4 w-4" /> Imprimir o guardar como PDF
        </button>
      </div>
    </div>
  );
}
