import { Card } from './ui/card.js';

// Número grande, etiqueta chica en mayúsculas: el mismo lenguaje visual de las imágenes de
// referencia y del sistema de diseño de Plan 1.
export function StatTile({ label, value, tone }: { label: string; value: string | number; tone?: 'danger' }) {
  return (
    <Card className="p-4">
      <p className={`text-2xl font-semibold ${tone === 'danger' ? 'text-red-600' : 'text-gray-900'}`}>{value}</p>
      <p className="mt-1 text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
    </Card>
  );
}
