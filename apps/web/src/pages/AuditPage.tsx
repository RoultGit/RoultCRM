import type { AuditEntryDTO } from '@roult/shared';
import { Card } from '../components/ui/card.js';
import { Badge } from '../components/ui/badge.js';
import { useAudit } from '../hooks/useAudit.js';
import { useUsers } from '../hooks/useUsers.js';
import { formatMoney } from '../lib/money.js';

const ACTION_LABEL: Record<string, string> = {
  CREATE: 'Creó',
  UPDATE: 'Modificó',
  STAGE_CHANGE: 'Cambió de etapa',
  ASSIGN: 'Reasignó',
  STATUS_CHANGE: 'Cambió el estado',
  CONVERT: 'Convirtió',
  DELETE: 'Eliminó',
};

const ENTITY_LABEL: Record<string, string> = {
  COMPANY: 'una empresa',
  CONTACT: 'un contacto',
  LEAD: 'un lead',
  DEAL: 'un deal',
  USER: 'una persona del equipo',
  TENANT: 'una empresa cliente',
};

// Solo los cambios de una sola dimensión se resumen como «antes → después». Un UPDATE guarda el DTO
// entero de los dos lados y renderizarlo sería un muro de JSON que nadie lee.
function detail(entry: AuditEntryDTO, nombre: (id: unknown) => string): string | null {
  const before = entry.before as Record<string, unknown> | null;
  const after = entry.after as Record<string, unknown> | null;
  if (entry.action === 'STAGE_CHANGE') return `${before?.stage ?? '—'} → ${after?.stage ?? '—'}`;
  if (entry.action === 'STATUS_CHANGE') return `${before?.status ?? '—'} → ${after?.status ?? '—'}`;
  // Un DELETE es el único caso donde el registro ya no existe en ningún lado: el resumen tiene que
  // decir qué era, o la línea de auditoría no sirve para nada.
  if (entry.action === 'DELETE' && before) {
    const amount =
      before.amount && formatMoney(before.amount as string, before.currency as 'PEN' | 'USD');
    return [before.title, before.companyName, amount].filter(Boolean).join(' · ');
  }
  if (entry.action === 'ASSIGN') {
    // Con el id en crudo la línea es ilegible y además larguísima: lo que hay que leer es quién
    // pasó a tener eso, no un uuid.
    const cuantos = after?.count as number | undefined;
    const sufijo = cuantos && cuantos > 1 ? ` · ${cuantos} a la vez` : '';
    return `${nombre(before?.assignedUserId)} → ${nombre(after?.assignedUserId)}${sufijo}`;
  }
  return null;
}

export function AuditPage() {
  const { data: entries, isLoading } = useAudit();
  const { data: equipo } = useUsers();

  // El nombre sale del equipo; si la persona ya no está, queda el id cortado, que al menos permite
  // rastrearlo. Un log histórico no puede depender de que la fila del usuario siga existiendo.
  const nombre = (id: unknown) => {
    if (!id || typeof id !== 'string') return 'sin asignar';
    const u = (equipo ?? []).find((x) => x.id === id);
    return u ? `${u.firstName} ${u.lastName}` : `alguien (${id.slice(0, 8)})`;
  };

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Auditoría</h1>
      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="p-6 text-sm text-gray-500">Cargando…</div>
        ) : !entries || entries.length === 0 ? (
          <div className="p-6 text-sm text-gray-500">Todavía no hay movimientos registrados.</div>
        ) : (
          /* Alto fijo y scroll propio: la auditoría crece sin parar, y con doscientos movimientos
             la página se hacía interminable hacia abajo. */
          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
            {/* El encabezado queda fijo arriba: scrolleando cien filas, sin esto no se sabe qué
                columna es cuál. */}
            <thead className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50">
              <tr>
                {['Cuándo', 'Quién', 'Qué', 'Detalle'].map((header) => (
                  <th key={header} className="px-4 py-3 font-medium text-gray-600">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-b border-gray-100 last:border-0">
                  {/* Acá sí va la hora local completa: es un instante, no una fecha de calendario,
                      así que no usa los helpers de lib/date.ts. */}
                  <td className="whitespace-nowrap px-4 py-3 text-gray-500">
                    {new Date(entry.createdAt).toLocaleString('es-PE')}
                  </td>
                  <td className="px-4 py-3">{entry.userName}</td>
                  <td className="px-4 py-3">
                    <Badge tone="neutral">{ACTION_LABEL[entry.action] ?? entry.action}</Badge>{' '}
                    {ENTITY_LABEL[entry.entityType] ?? entry.entityType}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{detail(entry, nombre) ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </Card>
      {entries && entries.length > 0 && (
        <p className="mt-2 text-xs text-gray-500">
          Se muestran los últimos {entries.length} movimientos, del más reciente al más viejo.
        </p>
      )}
    </div>
  );
}
