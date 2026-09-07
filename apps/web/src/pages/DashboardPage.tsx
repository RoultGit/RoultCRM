import { Card } from '../components/ui/card.js';
import { StatTile } from '../components/StatTile.js';
import { useDashboard } from '../hooks/useDashboard.js';
import { useSession } from '../hooks/useAuth.js';
import { formatMoney } from '../lib/money.js';

export function DashboardPage() {
  const { data, isLoading } = useDashboard();
  const isAdmin = useSession().data?.role === 'ADMIN';

  if (isLoading || !data) {
    return <Card className="p-6 text-sm text-gray-500">Cargando…</Card>;
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">{isAdmin ? 'Resumen del equipo' : 'Mi resumen'}</h1>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Leads nuevos" value={data.leadsNew} />
        <StatTile label="Deals activos" value={data.dealsActive} />
        <StatTile label="Deals ganados" value={data.dealsWon} />
        <StatTile label="Deals perdidos" value={data.dealsLost} />
        <StatTile label={isAdmin ? 'Clientes' : 'Mis clientes'} value={data.clientsActive} />
        <StatTile label="Tareas próximas" value={data.tasksUpcoming} />
        <StatTile label="Tareas vencidas" value={data.tasksOverdue} tone={data.tasksOverdue > 0 ? 'danger' : undefined} />
      </div>

      {/* PEN y USD siempre separados, nunca un total combinado (spec de negocio, sección 21). */}
      <h2 className="mb-2 text-sm font-medium text-gray-600">Montos por moneda</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Ganado PEN" value={formatMoney(data.wonAmount.PEN, 'PEN')} />
        <StatTile label="Ganado USD" value={formatMoney(data.wonAmount.USD, 'USD')} />
        <StatTile label="En juego PEN" value={formatMoney(data.activeAmount.PEN, 'PEN')} />
        <StatTile label="En juego USD" value={formatMoney(data.activeAmount.USD, 'USD')} />
      </div>
    </div>
  );
}
