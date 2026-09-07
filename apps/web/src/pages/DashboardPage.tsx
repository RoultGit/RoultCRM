import { useState } from 'react';
import { Card } from '../components/ui/card.js';
import { useDashboard, useDashboardCharts } from '../hooks/useDashboard.js';
import { useSession } from '../hooks/useAuth.js';
import { formatMoney } from '../lib/money.js';
import {
  MonthlyTrend,
  OutcomeDonut,
  SellerList,
  SourceList,
  Sparkline,
  StageBars,
  WonAmountArea,
} from '../components/charts/DashboardCharts.js';

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

const RANGES = [
  { months: 3, label: '3M' },
  { months: 6, label: '6M' },
  { months: 12, label: '12M' },
];

// La tarjeta de arriba: número grande, etiqueta chica y, cuando hay serie, el micro-gráfico al lado
// que le da contexto. Sin la serie el número dice "cuántos"; con ella dice también "para dónde va".
function KpiTile({
  label,
  value,
  series,
  tone,
}: {
  label: string;
  value: string | number;
  series?: number[];
  tone?: 'danger';
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <p className={`text-2xl font-semibold ${tone === 'danger' ? 'text-red-600' : 'text-gray-900'}`}>{value}</p>
        {series && <Sparkline values={series} tone={tone === 'danger' ? 'lost' : 'ink'} />}
      </div>
      <p className="mt-1 text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
    </Card>
  );
}

function MoneyTile({ label, amount, currency }: { label: string; amount: string; currency: 'PEN' | 'USD' }) {
  return (
    <Card className="p-4">
      <p className="text-xl font-semibold text-gray-900">{formatMoney(amount, currency)}</p>
      <p className="mt-1 text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
    </Card>
  );
}

export function DashboardPage() {
  const [months, setMonths] = useState(6);
  const { data, isLoading } = useDashboard();
  const { data: charts } = useDashboardCharts(months);
  const isAdmin = useSession().data?.role === 'ADMIN';

  if (isLoading || !data) {
    return <Card className="p-6 text-sm text-gray-500">Cargando…</Card>;
  }

  const monthly = charts?.monthly ?? [];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{isAdmin ? 'Resumen del equipo' : 'Mi resumen'}</h1>
        {/* Segmented control: el rango se elige de un toque y siempre se ve cuál está activo, en
            vez de esconderlo en un desplegable que hay que abrir para saber qué estás mirando. */}
        <div className="flex rounded-lg border border-gray-200 bg-white p-0.5">
          {RANGES.map((range) => (
            <button
              key={range.months}
              onClick={() => setMonths(range.months)}
              aria-pressed={months === range.months}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                months === range.months ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>

      {/* Cada sparkline es la historia mensual DEL MISMO número que tiene al lado. Antes "Deals
          activos" mostraba la serie de deals creados: el número decía una cosa y el gráfico otra.
          Por eso las tarjetas con serie son las del período, y las que no tienen historia mensual
          (leads nuevos, tareas vencidas) van sin sparkline en vez de con una prestada. */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiTile label="Leads nuevos" value={data.leadsNew} />
        <KpiTile label="Deals creados" value={sum(monthly.map((m) => m.created))} series={monthly.map((m) => m.created)} />
        <KpiTile label="Deals ganados" value={sum(monthly.map((m) => m.won))} series={monthly.map((m) => m.won)} />
        <KpiTile
          label="Deals perdidos"
          value={sum(monthly.map((m) => m.lost))}
          series={monthly.map((m) => m.lost)}
          tone={sum(monthly.map((m) => m.lost)) > 0 ? 'danger' : undefined}
        />
        <KpiTile
          label="Tareas vencidas"
          value={data.tasksOverdue}
          tone={data.tasksOverdue > 0 ? 'danger' : undefined}
        />
      </div>

      {/* Una sola grilla de 3 columnas para todos los gráficos: así los bordes de las cards se
          alinean entre filas. Con una grilla por fila, cada una repartía el ancho a su manera y las
          columnas quedaban corridas de una fila a la otra. */}
      <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <MonthlyTrend data={monthly} className="lg:col-span-2" />
        <OutcomeDonut summary={data} />
        <WonAmountArea data={monthly} className="lg:col-span-2" />
        <SourceList data={charts?.leadsBySource ?? []} />
        <StageBars data={charts?.pipelineByStage ?? []} className="lg:col-span-2" />
        {/* La comparativa entre vendedores es información de jefe: al vendedor le llega vacía del
            backend, así que ni siquiera se dibuja la card. */}
        {isAdmin && <SellerList data={charts?.bySeller ?? []} />}
      </div>

      {/* PEN y USD siempre separados, nunca un total combinado (spec de negocio, sección 21). */}
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">Montos por moneda</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MoneyTile label="Ganado PEN" amount={data.wonAmount.PEN} currency="PEN" />
        <MoneyTile label="Ganado USD" amount={data.wonAmount.USD} currency="USD" />
        <MoneyTile label="En juego PEN" amount={data.activeAmount.PEN} currency="PEN" />
        <MoneyTile label="En juego USD" amount={data.activeAmount.USD} currency="USD" />
      </div>
    </div>
  );
}
