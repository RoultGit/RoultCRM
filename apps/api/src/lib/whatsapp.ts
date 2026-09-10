/**
 * Cliente de la WhatsApp Cloud API de Meta.
 *
 * Sin SDK, igual que el correo: es un POST con un JSON. El SDK oficial de Meta arrastra medio grafo
 * de dependencias para armar una request.
 */

const GRAPH = 'https://graph.facebook.com/v21.0';

export interface SendResult {
  ok: boolean;
  messageId?: string;
  /** Mensaje para mostrarle al usuario, ya traducido de la jerga de Meta. */
  error?: string;
}

/**
 * Meta pide el número en formato internacional sin + ni espacios. Un "987 654 321" tal como se
 * carga en el CRM nunca llegaría, y la API responde un éxito igual: el mensaje se pierde en silencio.
 */
export function toWaNumber(raw: string, defaultCountry = '51'): string {
  const digits = raw.replace(/\D/g, '');
  // Los números peruanos se cargan como 9 dígitos; el resto ya viene con su país adelante.
  return digits.length <= 9 ? `${defaultCountry}${digits}` : digits;
}

async function post(phoneNumberId: string, token: string, payload: unknown): Promise<SendResult> {
  try {
    const res = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await res.json().catch(() => ({}))) as {
      messages?: { id: string }[];
      error?: { message?: string; code?: number };
    };
    if (!res.ok) {
      const code = body.error?.code;
      // El 131047 es el error más frecuente y el más confuso: la API contesta "Re-engagement
      // message" y el vendedor no tiene forma de saber que le está hablando a alguien que no le
      // escribe hace más de un día.
      const error =
        code === 131047
          ? 'Pasaron más de 24 horas desde el último mensaje del cliente. Solo se le puede escribir con una plantilla aprobada por Meta.'
          : code === 190
            ? 'El token de WhatsApp venció o fue revocado. Hay que volver a conectarlo.'
            : (body.error?.message ?? `WhatsApp respondió ${res.status}`);
      return { ok: false, error };
    }
    return { ok: true, messageId: body.messages?.[0]?.id };
  } catch (err) {
    console.error('[whatsapp] no se pudo enviar', err);
    return { ok: false, error: 'No se pudo contactar a WhatsApp. Probá de nuevo.' };
  }
}

/** Texto libre. Solo funciona dentro de las 24h desde el último mensaje del cliente. */
export function sendText(
  phoneNumberId: string,
  token: string,
  to: string,
  body: string
): Promise<SendResult> {
  return post(phoneNumberId, token, {
    messaging_product: 'whatsapp',
    to: toWaNumber(to),
    type: 'text',
    text: { preview_url: true, body },
  });
}

/** Plantilla aprobada: es la única forma de escribir primero o después de las 24h. */
export function sendTemplate(
  phoneNumberId: string,
  token: string,
  to: string,
  template: string,
  language = 'es',
  params: string[] = []
): Promise<SendResult> {
  return post(phoneNumberId, token, {
    messaging_product: 'whatsapp',
    to: toWaNumber(to),
    type: 'template',
    template: {
      name: template,
      language: { code: language },
      ...(params.length
        ? { components: [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text })) }] }
        : {}),
    },
  });
}
