import { useState } from 'react';
import { FileText, Handshake, Mail, MapPin, MessageCircle, Phone } from 'lucide-react';
import {
  ACTIVITY_LABEL,
  ACTIVITY_OPTIONS,
  type ActivityDTO,
  type ActivityType,
  type UserDTO,
} from '@roult/shared';
import { Button } from '../ui/button.js';
import { useActivities, useLogActivity } from '../../hooks/useActivities.js';
import { useUsers } from '../../hooks/useUsers.js';

const ICON: Record<ActivityType, typeof Phone> = {
  CALL: Phone,
  WHATSAPP: MessageCircle,
  MEETING: Handshake,
  EMAIL: Mail,
  VISIT: MapPin,
  NOTE: FileText,
};

// El color separa los canales de un vistazo: en una historia larga, "qué fue" se lee antes por el
// ícono que por la etiqueta.
const TONE: Record<ActivityType, string> = {
  CALL: 'bg-blue-50 text-blue-600',
  WHATSAPP: 'bg-emerald-50 text-emerald-600',
  MEETING: 'bg-violet-50 text-violet-600',
  EMAIL: 'bg-amber-50 text-amber-600',
  VISIT: 'bg-rose-50 text-rose-600',
  NOTE: 'bg-gray-100 text-gray-500',
};

function when(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days < 0) return new Date(iso).toLocaleDateString('es-PE');
  if (days === 0) return 'hoy';
  if (days === 1) return 'ayer';
  if (days < 30) return `hace ${days} días`;
  return new Date(iso).toLocaleDateString('es-PE');
}

// Los mensajes que llegan por WhatsApp no los escribió nadie del equipo: los escribió el cliente.
export const WHATSAPP_AUTHOR = 'whatsapp:inbound';

function authorName(id: string, users?: UserDTO[]): string {
  if (id === WHATSAPP_AUTHOR) return 'El cliente';
  const user = users?.find((u) => u.id === id);
  return user ? `${user.firstName} ${user.lastName}` : 'Alguien';
}

/**
 * La historia de un cliente: qué se habló, cuándo y quién.
 *
 * Es el corazón del CRM. Sin esto el sistema sabe QUIÉN es el cliente pero no QUÉ pasó con él, y esa
 * historia vive en la cabeza del vendedor o en su WhatsApp: cuando se va, la empresa la pierde.
 */
export function ActivityTimeline({
  relatedType,
  relatedId,
  title = 'Historial',
}: {
  relatedType: ActivityDTO['relatedType'];
  relatedId: string;
  title?: string;
}) {
  const related = { relatedType, relatedId };
  const { data: activities, isLoading } = useActivities(related);
  const { data: users } = useUsers();
  const log = useLogActivity(related);
  const [type, setType] = useState<ActivityType>('CALL');
  const [body, setBody] = useState('');
  // Vacío = ahora. Una llamada del viernes se anota el lunes, así que hay que poder corregirlo.
  const [occurredAt, setOccurredAt] = useState('');

  const submit = () => {
    if (!body.trim()) return;
    log.mutate(
      {
        type,
        body: body.trim(),
        // El input date da solo el día; se manda como mediodía UTC para que no se corra al día
        // anterior al leerlo en una zona negativa como la de Lima.
        occurredAt: occurredAt ? new Date(`${occurredAt}T12:00:00.000Z`).toISOString() : undefined,
      },
      { onSuccess: () => { setBody(''); setOccurredAt(''); } }
    );
  };

  const field = 'rounded-lg border border-gray-200 px-3 py-2 text-sm';

  return (
    <div>
      <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-500">{title}</h2>

      <div className="mb-5 rounded-xl border border-gray-200 bg-gray-50 p-3">
        <div className="mb-2 flex flex-wrap gap-2">
          {/* Botones y no un desplegable: el tipo se elige en cada carga, y un select agrega dos
              clics a la acción más repetida de la pantalla. */}
          {ACTIVITY_OPTIONS.map((option) => {
            const Icon = ICON[option.value];
            const active = type === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setType(option.value)}
                aria-pressed={active}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                  active ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:text-gray-900'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {option.label}
              </button>
            );
          })}
        </div>
        <textarea
          className={`${field} w-full`}
          rows={2}
          placeholder={`¿Qué pasó? Ej. "${type === 'CALL' ? 'Llamé, pidió la propuesta por correo' : 'Quedamos en reunirnos el jueves'}"`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            className={field}
            type="date"
            title="Cuándo pasó (si fue hoy, dejalo vacío)"
            value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)}
          />
          <span className="text-xs text-gray-400">Vacío = hoy</span>
          <Button size="sm" className="ml-auto" disabled={!body.trim() || log.isPending} onClick={submit}>
            {log.isPending ? 'Guardando…' : 'Registrar'}
          </Button>
        </div>
        {log.isError && <p className="mt-2 text-xs text-red-600">No se pudo registrar la interacción.</p>}
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-400">Cargando…</p>
      ) : (activities ?? []).length === 0 ? (
        <p className="text-sm text-gray-400">
          Todavía no hay nada registrado. Anotá la primera llamada o reunión y queda para todo el equipo.
        </p>
      ) : (
        <ol className="space-y-4">
          {(activities ?? []).map((activity, index) => {
            const Icon = ICON[activity.type];
            return (
              <li key={activity.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${TONE[activity.type]}`}>
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  {/* La línea conecta los hitos y hace que se lea como una secuencia. El último no
                      la lleva: no hay nada más abajo. */}
                  {index < (activities ?? []).length - 1 && <div className="mt-1 w-px flex-1 bg-gray-100" />}
                </div>
                <div className="min-w-0 flex-1 pb-1">
                  <p className="whitespace-pre-wrap text-sm text-gray-900">{activity.body}</p>
                  <p className="mt-0.5 text-[11px] text-gray-400">
                    {ACTIVITY_LABEL[activity.type]} · {authorName(activity.authorId, users)} ·{' '}
                    {when(activity.occurredAt)}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
