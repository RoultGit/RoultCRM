import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { LINE_LABEL, BILLING_LABEL } from '@roult/shared';
import { Card } from '../components/ui/card.js';
import { Badge } from '../components/ui/badge.js';
import { useCompanies } from '../hooks/useCompanies.js';
import { useContacts } from '../hooks/useContacts.js';
import { useDeals } from '../hooks/useDeals.js';
import { useUsers } from '../hooks/useUsers.js';
import { ActivityTimeline } from '../components/activities/ActivityTimeline.js';
import { ContactActions } from '../components/ContactActions.js';
import { formatAmount } from '../lib/money.js';
import { formatDate } from '../lib/date.js';

const STAGE_LABEL: Record<string, string> = {
  CONTACTO: 'Contacto',
  PROPUESTA: 'Propuesta',
  NEGOCIACION: 'Negociación',
  ADELANTO: 'Adelanto',
  PRODUCCION: 'Producción',
  ENTREGADO: 'Entregado',
  MANTENIMIENTO: 'Mantenimiento',
  PERDIDO: 'Perdido',
};

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="truncate text-sm text-gray-900">{value || '—'}</p>
    </div>
  );
}

/**
 * La ficha del cliente: sus datos, sus contactos, sus ventas y su historia, en una sola pantalla.
 *
 * Antes todo vivía en filas de tabla con un diálogo de edición: se podía saber quién era el cliente,
 * pero no había ningún lugar donde ver qué pasó con él. Esta es la pantalla que un vendedor abre
 * antes de llamar.
 */
export function CompanyDetailPage() {
  const { id = '' } = useParams();
  // Se reusa la lista ya cacheada en vez de un endpoint por id: la cartera de una empresa entra
  // holgada en memoria y así abrir una ficha es instantáneo al volver del listado.
  const { data: companies, isLoading } = useCompanies();
  const { data: contacts } = useContacts();
  const { data: deals } = useDeals();
  const { data: users } = useUsers();

  const company = companies?.find((c) => c.id === id);
  if (isLoading) return <Card className="p-6 text-sm text-gray-500">Cargando…</Card>;
  if (!company) {
    return (
      <Card className="p-6">
        <p className="mb-3 text-sm text-gray-600">Esta empresa no existe o no es tuya.</p>
        <Link to="/companies" className="text-sm text-gray-900 underline">
          Volver a Empresas
        </Link>
      </Card>
    );
  }

  const misContactos = (contacts ?? []).filter((c) => c.companyId === id);
  const susDeals = (deals ?? []).filter((d) => d.companyId === id);
  const owner = users?.find((u) => u.id === company.assignedUserId);
  const saludo = `Hola ${company.representativeName ?? company.name}, te escribo de ROUlt.`;

  return (
    <div>
      <Link
        to="/companies"
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Empresas
      </Link>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card className="p-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-xl font-semibold">{company.name}</h1>
                <p className="mt-1 text-sm text-gray-500">
                  {company.representativeName ? `Representante: ${company.representativeName}` : 'Sin representante cargado'}
                </p>
              </div>
              <Badge tone={company.line === 'WEB' ? 'info' : 'neutral'}>{LINE_LABEL[company.line]}</Badge>
            </div>
            <ContactActions
              whatsapp={company.whatsapp}
              email={company.email}
              greeting={saludo}
              className="mb-4"
            />
            <div className="grid grid-cols-2 gap-3 border-t border-gray-100 pt-4 sm:grid-cols-4">
              <Field label="Ciudad" value={company.city} />
              <Field label="Origen" value={company.source} />
              <Field label="Vendedor" value={owner ? `${owner.firstName} ${owner.lastName}` : 'Sin asignar'} />
              <Field label="Cliente desde" value={formatDate(company.createdAt)} />
            </div>
            {company.notes && (
              <p className="mt-4 whitespace-pre-wrap border-t border-gray-100 pt-4 text-sm text-gray-600">
                {company.notes}
              </p>
            )}
          </Card>

          <Card className="p-5">
            <ActivityTimeline relatedType="COMPANY" relatedId={id} />
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-500">
              Ventas ({susDeals.length})
            </h2>
            {susDeals.length === 0 ? (
              <p className="text-sm text-gray-400">Todavía no hay ventas cargadas.</p>
            ) : (
              <ul className="space-y-3">
                {susDeals.map((deal) => (
                  <li key={deal.id} className="border-b border-gray-100 pb-3 last:border-0 last:pb-0">
                    <p className="text-sm font-medium text-gray-900">{deal.title}</p>
                    <p className="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
                      <span className="font-semibold text-gray-900">
                        {formatAmount(deal.amount, deal.currency, deal.billingType)}
                      </span>
                      <Badge tone={deal.stage === 'PERDIDO' ? 'danger' : 'neutral'}>
                        {STAGE_LABEL[deal.stage] ?? deal.stage}
                      </Badge>
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-500">
              Contactos ({misContactos.length})
            </h2>
            {misContactos.length === 0 ? (
              <p className="text-sm text-gray-400">Todavía no hay contactos cargados.</p>
            ) : (
              <ul className="space-y-3">
                {misContactos.map((contact) => (
                  <li key={contact.id} className="border-b border-gray-100 pb-3 last:border-0 last:pb-0">
                    <p className="text-sm font-medium text-gray-900">{contact.name}</p>
                    {contact.position && <p className="text-xs text-gray-500">{contact.position}</p>}
                    <ContactActions
                      phone={contact.phone}
                      whatsapp={contact.whatsapp}
                      email={contact.email}
                      greeting={`Hola ${contact.name}, te escribo de ROUlt.`}
                      className="mt-2"
                    />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Los montos de este cliente NO se suman entre monedas ni entre tipos de cobro: sería un
              total que no existe, igual que en el dashboard. */}
          <Card className="p-5">
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-500">Resumen</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Ventas activas</span>
                <span className="font-medium text-gray-900">
                  {susDeals.filter((d) => !['PERDIDO'].includes(d.stage)).length}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Suscripciones</span>
                <span className="font-medium text-gray-900">
                  {susDeals.filter((d) => d.billingType === 'MONTHLY').length}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Cobro</span>
                <span className="font-medium text-gray-900">
                  {susDeals.some((d) => d.billingType === 'MONTHLY')
                    ? BILLING_LABEL.MONTHLY
                    : BILLING_LABEL.ONE_TIME}
                </span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
