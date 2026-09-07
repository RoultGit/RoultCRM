import type { ReactNode } from 'react';
import { Card } from './ui/card.js';
import { useSession } from '../hooks/useAuth.js';

// Importar y Auditoría no aparecen en el sidebar de un vendedor, pero la URL sigue siendo tecleable.
// Sin esto la página quedaba cargando para siempre contra un 403, o peor, mostraba "no hay
// movimientos", que es mentira: los hay, simplemente no son suyos.
export function AdminOnly({ children }: { children: ReactNode }) {
  const session = useSession();
  if (session.isLoading) return <Card className="p-6 text-sm text-gray-500">Cargando…</Card>;
  if (session.data?.role !== 'ADMIN') {
    return (
      <Card className="p-6 text-sm text-gray-600">
        Esta sección es solo para administradores. Pedile acceso a quien administra el espacio de trabajo.
      </Card>
    );
  }
  return <>{children}</>;
}
