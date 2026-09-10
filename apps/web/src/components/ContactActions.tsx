import { Mail, MessageCircle, Phone } from 'lucide-react';
import { whatsappUrl, telUrl, mailtoUrl } from '../lib/contact.js';

/**
 * Los datos de contacto, accionables.
 *
 * Estaban guardados pero muertos: se veían en una celda y había que copiarlos a mano. En Perú la
 * venta se maneja por WhatsApp, así que un toque de diferencia decide si el equipo usa el CRM o
 * vuelve a su agenda del teléfono.
 */
export function ContactActions({
  phone,
  whatsapp,
  email,
  greeting,
  className,
}: {
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  /** Mensaje con el que abre el chat, para no arrancar de cero cada vez. */
  greeting?: string;
  className?: string;
}) {
  const items = [
    whatsapp && {
      key: 'wa',
      href: whatsappUrl(whatsapp, greeting),
      icon: MessageCircle,
      label: whatsapp,
      title: 'Abrir WhatsApp',
      tone: 'text-emerald-700 hover:bg-emerald-50',
    },
    phone && {
      key: 'tel',
      href: telUrl(phone),
      icon: Phone,
      label: phone,
      title: 'Llamar',
      tone: 'text-blue-700 hover:bg-blue-50',
    },
    email && {
      key: 'mail',
      href: mailtoUrl(email, greeting),
      icon: Mail,
      label: email,
      title: 'Escribir un correo',
      tone: 'text-gray-700 hover:bg-gray-100',
    },
  ].filter(Boolean) as { key: string; href: string; icon: typeof Phone; label: string; title: string; tone: string }[];

  if (items.length === 0) {
    return <p className={`text-sm text-gray-400 ${className ?? ''}`}>Sin datos de contacto cargados.</p>;
  }

  return (
    <div className={`flex flex-wrap gap-2 ${className ?? ''}`}>
      {items.map((item) => (
        <a
          key={item.key}
          href={item.href}
          // target y rel: wa.me abre en pestaña nueva, y sin noopener la página abierta puede
          // manipular a la que la abrió.
          target="_blank"
          rel="noopener noreferrer"
          title={item.title}
          className={`flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium transition-colors ${item.tone}`}
        >
          <item.icon className="h-3.5 w-3.5" />
          {item.label}
        </a>
      ))}
    </div>
  );
}
