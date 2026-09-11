import { X } from 'lucide-react';
import { Button } from './ui/button.js';

/**
 * La barra que aparece cuando hay filas seleccionadas.
 *
 * Se muestra solo con selección: una barra de acciones siempre visible ocupa lugar y confunde,
 * porque la mayoría de las veces no hay nada seleccionado sobre lo que actuar.
 */
export function BulkBar({
  count,
  onClear,
  children,
}: {
  count: number;
  onClear: () => void;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-gray-900 bg-gray-900 px-3 py-2 text-white">
      <span className="text-sm font-medium">
        {count} seleccionado{count === 1 ? '' : 's'}
      </span>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
      <Button
        variant="ghost"
        size="sm"
        className="ml-auto px-2 text-gray-300 hover:bg-gray-800 hover:text-white"
        aria-label="Quitar la selección"
        onClick={onClear}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
