import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, Check, Copy, Trash2 } from 'lucide-react';
import { Card } from '../components/ui/card.js';
import { WhatsAppCard } from '../components/whatsapp/WhatsAppCard.js';
import { InboxCard } from '../components/email/InboxCard.js';
import { Button } from '../components/ui/button.js';
import { apiClient } from '../lib/api.js';
import { formatDate } from '../lib/date.js';

interface KeyRow {
  id: string;
  name: string;
  lastFour: string;
  lastUsedAt: string | null;
  createdAt: string;
}

const KEYS = ['intake', 'keys'];

function useKeys() {
  return useQuery({ queryKey: KEYS, queryFn: async () => (await apiClient.get<KeyRow[]>('/intake/keys')).data });
}

export function IntegrationsPage() {
  const queryClient = useQueryClient();
  const { data: keys, isLoading } = useKeys();
  const [name, setName] = useState('');
  const [created, setCreated] = useState<{ name: string; key: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const create = useMutation({
    mutationFn: async (n: string) => (await apiClient.post<{ name: string; key: string }>('/intake/keys', { name: n })).data,
    onSuccess: (data) => {
      setCreated(data);
      setName('');
      queryClient.invalidateQueries({ queryKey: KEYS });
    },
  });
  const revoke = useMutation({
    mutationFn: async (id: string) => apiClient.delete(`/intake/keys/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEYS }),
  });

  const base = import.meta.env.VITE_API_URL ?? '';
  const ejemplo = `curl -X POST ${base}/intake/leads \\
  -H "X-API-Key: TU_CLAVE" \\
  -H "Content-Type: application/json" \\
  -d '{
    "businessName": "Nombre de la empresa",
    "contactName": "Quien escribió",
    "line": "WEB",
    "email": "correo@cliente.pe",
    "whatsapp": "987654321",
    "source": "Formulario web"
  }'`;

  return (
    <div>
      <h1 className="text-xl font-semibold">Conexiones</h1>
      <p className="mb-4 mt-1 text-sm text-gray-500">
        Lo que el CRM hace solo: recibir leads de tu sitio o de un chatbot, y avisarle a cada uno
        lo que se le vence.
      </p>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card className="p-5">
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-500">Claves de acceso</h2>
            <div className="mb-4 flex flex-wrap gap-2">
              <input
                className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm"
                placeholder="¿Para qué es? Ej. Formulario del sitio"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <Button disabled={!name.trim() || create.isPending} onClick={() => create.mutate(name.trim())}>
                {create.isPending ? 'Creando…' : 'Crear clave'}
              </Button>
            </div>

            {isLoading ? (
              <p className="text-sm text-gray-400">Cargando…</p>
            ) : (keys ?? []).length === 0 ? (
              <p className="text-sm text-gray-400">
                Todavía no hay claves. Creá una para conectar tu formulario.
              </p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {(keys ?? []).map((key) => (
                  <li key={key.id} className="flex items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900">{key.name}</p>
                      <p className="text-xs text-gray-500">
                        <span className="font-mono">····{key.lastFour}</span> · creada el{' '}
                        {formatDate(key.createdAt)} ·{' '}
                        {/* Sin esto, un formulario que dejó de enviar se ve igual que uno que anda:
                            la última vez que se usó es lo que delata que algo se rompió. */}
                        {key.lastUsedAt ? `último uso ${formatDate(key.lastUsedAt)}` : 'nunca usada'}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="px-2 text-gray-400 hover:bg-red-50 hover:text-red-600"
                      aria-label={`Revocar ${key.name}`}
                      title="Revocar"
                      onClick={() => revoke.mutate(key.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-500">Cómo conectarlo</h2>
            <p className="mb-3 text-sm text-gray-600">
              Pasale esto a quien maneje tu sitio. Cada envío crea un lead nuevo en estado{' '}
              <strong>Nuevo</strong>, sin asignar, listo para que alguien lo tome.
            </p>
            <pre className="overflow-x-auto rounded-lg bg-gray-900 p-3 text-[11px] leading-relaxed text-gray-100">
              {ejemplo}
            </pre>
            <p className="mt-3 text-xs text-gray-500">
              Obligatorios: <code>businessName</code>, <code>contactName</code> y <code>line</code>{' '}
              (WEB, SOFTWARE, AUTOMATIZACION o SERVICIO). El resto es opcional.
            </p>
          </Card>

        <Card className="p-5">
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-500">Cuidado con la clave</h2>
          <p className="mb-3 text-sm text-gray-600">
            La clave <strong>solo sirve para crear leads</strong>. No da acceso a tus clientes, tus
            ventas ni tu equipo.
          </p>
          <p className="mb-3 text-sm text-gray-600">
            Aun así, lo mejor es que el envío salga del <strong>servidor</strong> de tu sitio. Si lo
            hacés desde el navegador, la clave queda a la vista en el código de la página y cualquiera
            podría usarla para meterte leads falsos.
          </p>
          <p className="text-sm text-gray-600">
            Si eso pasa, revocá la clave acá y creá otra: el formulario deja de funcionar hasta que le
            pongan la nueva.
          </p>
        </Card>
        </div>

        <div className="space-y-4">
        <WhatsAppCard />

        <InboxCard />

        <RecordatoriosCard />
        </div>
      </div>

      {/* La clave se ve UNA vez. No se guarda en claro en ningún lado. */}
      <Dialog.Root open={!!created} onOpenChange={(open) => !open && (setCreated(null), setCopied(false))}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/30" />
          <Dialog.Content className="focus:outline-none fixed left-1/2 top-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-lg">
            <Dialog.Title className="mb-2 text-lg font-semibold">Clave creada</Dialog.Title>
            <p className="mb-4 text-sm text-amber-700">
              Copiala ahora. No se guarda en ningún lado y no se puede volver a ver.
            </p>
            <p className="mb-4 select-all break-all rounded-lg border border-gray-200 bg-gray-50 p-3 font-mono text-xs">
              {created?.key}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() =>
                  navigator.clipboard?.writeText(created?.key ?? '').then(
                    () => setCopied(true),
                    () => setCopied(false)
                  )
                }
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copiada' : 'Copiar'}
              </Button>
              <Button className="flex-1" onClick={() => (setCreated(null), setCopied(false))}>
                Ya la guardé
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

interface DigestPreview {
  mailConfigured: boolean;
  lastDigestAt: string | null;
  items: { kind: 'TASK' | 'NEXT_STEP'; title: string; subtitle: string | null; dueDate: string }[];
}

/**
 * El estado de los recordatorios diarios.
 *
 * Muestra lo que ESTE usuario recibiría hoy en vez de un botón de "probar": un botón que le manda
 * correo a todo el equipo para ver si anda es un botón que nadie aprieta dos veces.
 */
function RecordatoriosCard() {
  const { data } = useQuery({
    queryKey: ['reminders', 'mine'],
    queryFn: async () => (await apiClient.get<DigestPreview>('/cron/mine')).data,
  });

  const hoy = new Date().toISOString().slice(0, 10);

  return (
    <Card className="p-5">
      <h2 className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-gray-500">
        <Bell className="h-3.5 w-3.5" /> Recordatorios diarios
      </h2>
      <p className="mb-3 text-sm text-gray-600">
        Todas las mañanas sale un correo por persona con sus tareas y próximos pasos que vencen ese
        día o que ya se vencieron. Uno solo con todo junto, no uno por pendiente.
      </p>

      {data && !data.mailConfigured && (
        <p className="mb-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
          Falta configurar el correo de salida (RESEND_API_KEY y MAIL_FROM). Hasta que esté, los
          recordatorios se calculan pero no se envían.
        </p>
      )}

      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">Lo tuyo de hoy</p>
      {!data ? (
        <p className="text-sm text-gray-400">Cargando…</p>
      ) : data.items.length === 0 ? (
        <p className="text-sm text-gray-500">Nada pendiente para hoy. No recibirías correo.</p>
      ) : (
        <ul className="space-y-2">
          {data.items.slice(0, 6).map((item, i) => (
            <li key={i} className="flex items-start justify-between gap-3 text-sm">
              <span className="min-w-0">
                <span className="block truncate text-gray-900">{item.title}</span>
                <span className="text-xs text-gray-500">
                  {item.kind === 'TASK' ? 'Tarea' : 'Próximo paso'}
                  {item.subtitle ? ` · ${item.subtitle}` : ''}
                </span>
              </span>
              <span
                className={`whitespace-nowrap text-xs ${
                  item.dueDate.slice(0, 10) < hoy ? 'text-red-600' : 'text-gray-500'
                }`}
              >
                {item.dueDate.slice(0, 10) < hoy ? 'vencido' : 'hoy'}
              </span>
            </li>
          ))}
          {data.items.length > 6 && (
            <li className="text-xs text-gray-500">y {data.items.length - 6} más</li>
          )}
        </ul>
      )}
    </Card>
  );
}
