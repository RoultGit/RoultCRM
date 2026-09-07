import { useUsers } from '../hooks/useUsers.js';
import { useSession } from '../hooks/useAuth.js';

// Misma celda en Leads y en Empresas: un ADMIN reasigna con un select, un VENDEDOR solo lee.
// Solo un ADMIN puede reasignar (spec de negocio, sección 12), y el backend lo rechaza con 403
// igual, así que el select ni se renderiza para un vendedor.
export function AssigneeCell({
  assignedUserId,
  onChange,
  disabled = false,
}: {
  assignedUserId: string | null;
  onChange: (assignedUserId?: string) => void;
  disabled?: boolean;
}) {
  const { data: users } = useUsers();
  const isAdmin = useSession().data?.role === 'ADMIN';
  const owner = users?.find((u) => u.id === assignedUserId);

  if (!isAdmin) {
    return <span className="text-sm text-gray-600">{owner ? `${owner.firstName} ${owner.lastName}` : '—'}</span>;
  }

  return (
    <select
      className="rounded-lg border border-gray-200 px-2 py-1 text-sm"
      value={assignedUserId ?? ''}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value || undefined)}
    >
      <option value="">Sin asignar</option>
      {users?.map((user) => (
        <option key={user.id} value={user.id}>
          {user.firstName} {user.lastName}
        </option>
      ))}
    </select>
  );
}
