import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Page } from '../../hooks/usePagedQuery.js';
import { Button } from './button.js';

/**
 * El pie de una lista paginada.
 *
 * Se esconde cuando todo entra en una página: mostrar "1 de 1" con dos flechas apagadas es ruido
 * en la pantalla del 90% de los clientes, que nunca van a pasar de la primera.
 */
export function Pagination({
  page,
  total,
  onChange,
  etiqueta = 'registros',
}: {
  page: Page;
  total: number;
  onChange: (page: Page) => void;
  etiqueta?: string;
}) {
  if (total <= page.limit) return null;

  const desde = page.offset + 1;
  const hasta = Math.min(page.offset + page.limit, total);
  const hayAnterior = page.offset > 0;
  const haySiguiente = hasta < total;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-4 py-3">
      <p className="text-xs text-gray-500">
        <span className="tabular-nums">
          {desde}–{hasta}
        </span>{' '}
        de <span className="tabular-nums font-medium text-gray-900">{total}</span> {etiqueta}
      </p>
      <div className="flex gap-1">
        <Button
          variant="outline"
          size="sm"
          className="px-2"
          aria-label="Página anterior"
          disabled={!hayAnterior}
          onClick={() => onChange({ ...page, offset: Math.max(0, page.offset - page.limit) })}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="px-2"
          aria-label="Página siguiente"
          disabled={!haySiguiente}
          onClick={() => onChange({ ...page, offset: page.offset + page.limit })}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
