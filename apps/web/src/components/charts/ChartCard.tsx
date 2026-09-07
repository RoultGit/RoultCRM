import type { ReactNode } from 'react';
import { Card } from '../ui/card.js';

// El marco compartido de todos los gráficos: título chico en mayúsculas arriba a la izquierda, un
// hueco para controles a la derecha, y el gráfico con una altura fija. La altura la fija la card y
// no el gráfico porque ResponsiveContainer necesita un padre con altura concreta — con height
// automática Recharts colapsa a cero y no dibuja nada.
export function ChartCard({
  title,
  action,
  hint,
  height = 240,
  children,
  className,
}: {
  title: string;
  action?: ReactNode;
  hint?: string;
  height?: number;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={`flex flex-col p-5 ${className ?? ''}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xs font-medium uppercase tracking-wide text-gray-500">{title}</h2>
          {hint && <p className="mt-1 text-sm text-gray-900">{hint}</p>}
        </div>
        {action}
      </div>
      <div style={{ height }} className="min-w-0">
        {children}
      </div>
    </Card>
  );
}

// El tooltip de Recharts trae su propio borde y su propia tipografía. Este usa las mismas fichas
// que el resto de la app para que no se note que viene de una librería.
export function ChartTooltip({
  active,
  label,
  rows,
}: {
  active?: boolean;
  label?: ReactNode;
  rows: { name: string; value: ReactNode; color?: string }[];
}) {
  if (!active || rows.length === 0) return null;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-lg">
      {label !== undefined && <p className="mb-1 text-xs font-medium text-gray-900">{label}</p>}
      {rows.map((row) => (
        <p key={row.name} className="flex items-center gap-2 text-xs text-gray-600">
          {row.color && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: row.color }} />}
          <span>{row.name}</span>
          <span className="ml-auto font-medium text-gray-900">{row.value}</span>
        </p>
      ))}
    </div>
  );
}

// Un gráfico vacío no puede verse igual que uno cargando. Este mensaje ocupa el mismo alto que el
// gráfico para que la grilla del dashboard no se mueva cuando llegan los datos.
export function ChartEmpty({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center text-center text-sm text-gray-400">{children}</div>
  );
}
