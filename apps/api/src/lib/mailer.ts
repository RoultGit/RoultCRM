/**
 * Envío de correo, contra la API de Resend.
 *
 * Sin SDK: la API de Resend es un POST HTTPS con un JSON, y `fetch` viene en Node desde la 18.
 * Agregar una dependencia para armar una request es cargar un paquete, su cadena de dependencias y
 * sus actualizaciones de seguridad a cambio de nada.
 */

export interface Email {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export function isMailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY && !!process.env.MAIL_FROM;
}

/**
 * Manda el correo. Devuelve si se pudo o no; NUNCA lanza.
 *
 * El que llama no puede cambiar su respuesta según esto: "olvidé mi contraseña" tiene que contestar
 * lo mismo exista o no la cuenta, y si un fallo de envío se filtrara al usuario, la diferencia de
 * respuestas revelaría qué correos están registrados.
 */
export async function sendEmail(email: Email): Promise<boolean> {
  if (!isMailConfigured()) {
    // Ruidoso a propósito. Sin esto, la función queda muda en producción y nadie se entera de que
    // los correos no salen hasta que un cliente reclama.
    console.error(
      '[mailer] RESEND_API_KEY o MAIL_FROM sin configurar: el correo NO se envió.',
      { to: email.to, subject: email.subject }
    );
    // Fuera de producción se imprime el contenido, que es lo que hace usable la función en
    // desarrollo sin contratar nada.
    if (process.env.NODE_ENV !== 'production') console.info('[mailer] contenido:\n' + email.text);
    return false;
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.MAIL_FROM,
        to: [email.to],
        subject: email.subject,
        html: email.html,
        text: email.text,
      }),
      // Sin timeout, un proveedor lento deja colgada la request del usuario hasta que la corta el
      // servidor. Diez segundos es de sobra para un POST a una API de correo.
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error('[mailer] Resend respondió', res.status, (await res.text()).slice(0, 300));
      return false;
    }
    return true;
  } catch (err) {
    console.error('[mailer] no se pudo enviar el correo', err);
    return false;
  }
}

// El dominio del link sale de WEB_ORIGIN y NUNCA de una cabecera del request. Si se tomara del Host,
// alguien podría pedir un reseteo con un Host falso y recibir la víctima un link a un dominio suyo.
export function webOrigin(): string {
  return (process.env.WEB_ORIGIN ?? 'http://localhost:5173').split(',')[0].trim();
}

export function passwordResetEmail(name: string, link: string): Omit<Email, 'to'> {
  const text = [
    `Hola ${name},`,
    '',
    'Pediste restablecer tu contraseña de RoultCRM. Entrá acá para elegir una nueva:',
    link,
    '',
    'El link vence en 1 hora y se puede usar una sola vez.',
    'Si no lo pediste vos, ignorá este correo: tu contraseña sigue igual.',
  ].join('\n');

  const html = `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#111827">
  <p style="font-size:18px;font-weight:600;margin:0 0 16px">RoultCRM</p>
  <p style="margin:0 0 16px">Hola ${escapeHtml(name)},</p>
  <p style="margin:0 0 20px">Pediste restablecer tu contraseña. Elegí una nueva desde acá:</p>
  <p style="margin:0 0 24px">
    <a href="${link}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:500">Elegir contraseña nueva</a>
  </p>
  <p style="margin:0 0 8px;font-size:13px;color:#6B7280">El link vence en 1 hora y se puede usar una sola vez.</p>
  <p style="margin:0;font-size:13px;color:#6B7280">Si no lo pediste vos, ignorá este correo: tu contraseña sigue igual.</p>
</div>`;

  return { subject: 'Restablecer tu contraseña de RoultCRM', html, text };
}

// El nombre viene de la base y termina dentro del HTML del correo: sin escaparlo, un nombre con
// etiquetas se inyectaría en el mensaje.
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string
  );
}
