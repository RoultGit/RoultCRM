import { Link, useRouteError } from 'react-router-dom';
import { Card } from '../components/ui/card.js';

// Sin esto, cualquier URL desconocida mostraba la pantalla de error cruda de React Router, con un
// "Hey developer 👋" y un emoji de diskette, a un vendedor que se equivocó al tipear.
export function NotFoundPage() {
  const error = useRouteError() as { status?: number } | undefined;
  const isNotFound = error?.status === 404 || !error;

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface p-6">
      <Card className="max-w-md p-8 text-center">
        <p className="text-lg font-semibold text-gray-900">
          {isNotFound ? 'Esta página no existe' : 'Algo salió mal'}
        </p>
        <p className="mt-2 text-sm text-gray-500">
          {isNotFound
            ? 'Revisá la dirección o volvé al inicio.'
            : 'Probá de nuevo. Si sigue pasando, avisale a quien administra el sistema.'}
        </p>
        <Link to="/" className="mt-4 inline-block text-sm text-gray-900 underline">
          Volver al inicio
        </Link>
      </Card>
    </div>
  );
}
