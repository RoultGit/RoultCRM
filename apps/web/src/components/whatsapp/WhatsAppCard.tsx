import { useState } from 'react';
import { Check, Copy, MessageCircle } from 'lucide-react';
import { Card } from '../ui/card.js';
import { Button } from '../ui/button.js';
import { useWhatsAppStatus, useConnectWhatsApp, useDisconnectWhatsApp } from '../../hooks/useWhatsApp.js';

function Copiable({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mb-2">
      <p className="mb-1 text-xs text-gray-500">{label}</p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg bg-gray-50 px-2.5 py-1.5 text-xs text-gray-700">
          {value}
        </code>
        <Button
          variant="outline"
          size="sm"
          className="px-2"
          aria-label={`Copiar ${label}`}
          onClick={() => {
            navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </div>
  );
}

/**
 * Conectar el WhatsApp de la empresa.
 *
 * Cada empresa cliente conecta SU número: por eso los datos van a la base y no a variables de
 * entorno del servidor, que alcanzarían para una sola.
 */
export function WhatsAppCard() {
  const { data: status } = useWhatsAppStatus();
  const connect = useConnectWhatsApp();
  const disconnect = useDisconnectWhatsApp();
  const [form, setForm] = useState({ phoneNumberId: '', accessToken: '', appSecret: '', displayPhone: '' });

  const input = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm';
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((prev) => ({ ...prev, [k]: e.target.value }));

  return (
    <Card className="p-5">
      <h2 className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-gray-500">
        <MessageCircle className="h-3.5 w-3.5" /> WhatsApp Business
      </h2>

      {!status ? (
        <p className="text-sm text-gray-400">Cargando…</p>
      ) : status.connected ? (
        <>
          <p className="mb-3 text-sm text-gray-600">
            Conectado{status.displayPhone ? ` al ${status.displayPhone}` : ''}. Lo que escriban tus
            clientes queda en su ficha, y lo que mandes desde acá también.
          </p>
          {status.lastError && (
            <p className="mb-3 rounded-lg bg-red-50 p-3 text-xs text-red-800">
              Último problema: {status.lastError}
            </p>
          )}
          <Copiable label="URL del webhook (pegala en Meta)" value={status.webhookUrl} />
          <Copiable label="Token de verificación" value={status.verifyToken ?? ''} />
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            disabled={disconnect.isPending}
            onClick={() => disconnect.mutate()}
          >
            Desconectar
          </Button>
        </>
      ) : (
        <>
          <p className="mb-3 text-sm text-gray-600">
            Para responder y recibir mensajes desde el CRM. Los datos salen del panel de Meta, en
            WhatsApp → Configuración de la API.
          </p>
          {!status.encryptionReady && (
            <p className="mb-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
              Falta ENCRYPTION_KEY en el servidor. Sin eso no se guardan credenciales: en claro,
              cualquiera que lea la base podría escribirle a tus clientes en tu nombre.
            </p>
          )}
          <div className="space-y-2">
            <input className={input} placeholder="Phone number ID" value={form.phoneNumberId} onChange={set('phoneNumberId')} />
            <input className={input} placeholder="Número visible. Ej. +51 987 654 321" value={form.displayPhone} onChange={set('displayPhone')} />
            <input className={input} type="password" placeholder="Token de acceso permanente" value={form.accessToken} onChange={set('accessToken')} autoComplete="off" />
            <input className={input} type="password" placeholder="App secret (Settings → Basic en Meta)" value={form.appSecret} onChange={set('appSecret')} autoComplete="off" />
            {connect.isError && (
              <p className="text-xs text-red-600">
                {(connect.error as { response?: { data?: { error?: string } } })?.response?.data?.error ??
                  'No se pudo conectar.'}
              </p>
            )}
            <Button
              className="w-full"
              disabled={!form.phoneNumberId.trim() || !form.accessToken.trim() || !form.appSecret.trim() || connect.isPending}
              onClick={() =>
                connect.mutate({
                  phoneNumberId: form.phoneNumberId.trim(),
                  accessToken: form.accessToken.trim(),
                  appSecret: form.appSecret.trim(),
                  displayPhone: form.displayPhone.trim() || undefined,
                })
              }
            >
              {connect.isPending ? 'Conectando…' : 'Conectar'}
            </Button>
            <p className="text-xs text-gray-500">
              El app secret es obligatorio: es lo único con lo que se comprueba que un mensaje
              entrante vino de Meta y no de cualquiera que sepa la dirección. Después de conectar
              aparecen acá la URL del webhook y el token de verificación para pegar en Meta.
            </p>
          </div>
        </>
      )}
    </Card>
  );
}
