import { Link } from 'react-router-dom';

/**
 * El marco de las páginas legales.
 *
 * Van fuera del AppShell y sin sesión a propósito: la primera persona que las lee es alguien que
 * todavía no es cliente y está evaluando si confiarnos los datos de SUS clientes.
 */
export function LegalLayout({
  titulo,
  actualizado,
  children,
}: {
  titulo: string;
  actualizado: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50 py-8 print:bg-white">
      <div className="mx-auto max-w-3xl px-4">
        <div className="rounded-xl bg-white p-6 shadow-sm sm:p-10 print:shadow-none">
          <Link to="/login" className="text-sm text-gray-500 hover:text-gray-900 print:hidden">
            ← RoultCRM
          </Link>
          <h1 className="mt-4 text-2xl font-semibold text-gray-900">{titulo}</h1>
          <p className="mt-1 text-sm text-gray-500">Última actualización: {actualizado}</p>
          <div className="prose-roult mt-6 space-y-5 text-sm leading-relaxed text-gray-700">{children}</div>
        </div>
        <p className="mt-4 flex flex-wrap justify-center gap-4 text-xs text-gray-500 print:hidden">
          <Link to="/privacidad" className="hover:text-gray-900">Política de privacidad</Link>
          <Link to="/terminos" className="hover:text-gray-900">Términos del servicio</Link>
        </p>
      </div>
    </div>
  );
}

export function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="pt-3 text-base font-semibold text-gray-900">{children}</h2>;
}

export function Lista({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2">
          <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-gray-400" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
