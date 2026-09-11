import { useState } from 'react';
import { Check, Copy, Eye, Send, Trash2 } from 'lucide-react';
import { QUOTE_STATUS_LABEL, type QuoteDTO, type QuoteStatus } from '@roult/shared';
import { Card } from '../components/ui/card.js';
import { Button } from '../components/ui/button.js';
import { Badge } from '../components/ui/badge.js';
import { QuoteDialog } from '../components/quotes/QuoteDialog.js';
import { useQuotes, useSendQuote, useDeleteQuote } from '../hooks/useQuotes.js';
import { formatMoney } from '../lib/money.js';
import { formatDate } from '../lib/date.js';

const TONO: Record<QuoteStatus, 'neutral' | 'info' | 'success' | 'danger' | 'warning'> = {
  DRAFT: 'neutral',
  SENT: 'info',
  ACCEPTED: 'success',
  REJECTED: 'danger',
  EXPIRED: 'warning',
};

function CopiarLink({ url }: { url: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      className="px-2"
      title="Copiar el link para el cliente"
      aria-label="Copiar el link para el cliente"
      onClick={() => {
        navigator.clipboard.writeText(url);
        setCopiado(true);
        setTimeout(() => setCopiado(false), 1500);
      }}
    >
      {copiado ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
    </Button>
  );
}

function Fila({ quote }: { quote: QuoteDTO }) {
  const enviar = useSendQuote();
  const borrar = useDeleteQuote();
  const respondida = quote.status === 'ACCEPTED' || quote.status === 'REJECTED';

  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <span className="w-10 shrink-0 text-sm tabular-nums text-gray-400">#{quote.number}</span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-900">{quote.title}</p>
        <p className="text-xs text-gray-500">
          {quote.companyName}
          {quote.sentAt && ` · enviada ${formatDate(quote.sentAt)}`}
          {/* Que el cliente la haya abierto es justo lo que un PDF adjunto nunca puede decir. */}
          {quote.viewedAt && ' · la abrió'}
          {quote.respondedBy && ` · ${quote.respondedBy}`}
        </p>
      </div>

      <span className="shrink-0 text-sm font-medium tabular-nums text-gray-900">
        {formatMoney(String(quote.total), quote.currency)}
      </span>

      <Badge tone={TONO[quote.status]}>{QUOTE_STATUS_LABEL[quote.status]}</Badge>

      <div className="flex shrink-0 gap-1">
        {quote.publicUrl && (
          <>
            <CopiarLink url={quote.publicUrl} />
            <a
              href={quote.publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Ver como la ve el cliente"
              aria-label="Ver como la ve el cliente"
              className="flex items-center rounded-lg border border-gray-200 bg-white px-2 text-gray-600 transition-colors hover:bg-gray-50"
            >
              <Eye className="h-4 w-4" />
            </a>
          </>
        )}

        {quote.status === 'DRAFT' && (
          <>
            <QuoteDialog quote={quote} trigger={<Button variant="outline" size="sm">Editar</Button>} />
            <Button size="sm" disabled={enviar.isPending} onClick={() => enviar.mutate(quote.id)}>
              <Send className="mr-1 h-3.5 w-3.5" /> Enviar
            </Button>
          </>
        )}

        {!respondida && (
          <Button
            variant="ghost"
            size="sm"
            className="px-2 text-gray-400 hover:text-red-600"
            aria-label={`Borrar cotización ${quote.number}`}
            disabled={borrar.isPending}
            onClick={() => borrar.mutate(quote.id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </li>
  );
}

export function QuotesPage() {
  const [status, setStatus] = useState('');
  const { data: quotes, isLoading } = useQuotes(status ? { status } : {});

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Cotizaciones</h1>
          <p className="mt-1 text-sm text-gray-500">
            Se manda como link, no como PDF adjunto: el cliente la abre del teléfono y responde ahí
            mismo, y vos ves si la abrió.
          </p>
        </div>
        <QuoteDialog trigger={<Button>Nueva cotización</Button>} />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <select
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">Todas</option>
          {(Object.keys(QUOTE_STATUS_LABEL) as QuoteStatus[]).map((s) => (
            <option key={s} value={s}>
              {QUOTE_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </div>

      <Card className="p-5">
        {isLoading ? (
          <p className="text-sm text-gray-400">Cargando…</p>
        ) : (quotes ?? []).length === 0 ? (
          <p className="text-sm text-gray-400">
            Todavía no hay cotizaciones. Armá la primera con el botón de arriba.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {(quotes ?? []).map((quote) => (
              <Fila key={quote.id} quote={quote} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
