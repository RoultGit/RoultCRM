/**
 * Almacenamiento de archivos, contra Supabase Storage.
 *
 * Sin SDK, igual que el correo y WhatsApp: son tres llamadas HTTP. El SDK de Supabase arrastra
 * medio cliente de base de datos para firmar una URL.
 *
 * El navegador sube DIRECTO al almacenamiento con una URL firmada, no a través de la API. Pasando
 * por la API, el límite de 4,5 MB del cuerpo de una función serverless sería el techo del tamaño de
 * archivo, y además cada subida ocuparía la función el tiempo que dure.
 */

const BUCKET = 'adjuntos';

export function isStorageConfigured(): boolean {
  return !!process.env.SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
}

function base(): string {
  return `${process.env.SUPABASE_URL}/storage/v1`;
}

function headers(): Record<string, string> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

export interface SignedUpload {
  /** A dónde manda el navegador el archivo. */
  url: string;
  token: string;
}

/** Una URL para subir UN archivo a UNA ruta. Vence sola y no sirve para ninguna otra. */
export async function signUpload(path: string): Promise<SignedUpload | null> {
  if (!isStorageConfigured()) return null;
  try {
    const res = await fetch(`${base()}/object/upload/sign/${BUCKET}/${encodeURI(path)}`, {
      method: 'POST',
      headers: headers(),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error('[storage] no se pudo firmar la subida', res.status, (await res.text()).slice(0, 200));
      return null;
    }
    const body = (await res.json()) as { url?: string; token?: string };
    if (!body.url) return null;
    return { url: `${process.env.SUPABASE_URL}/storage/v1${body.url}`, token: body.token ?? '' };
  } catch (err) {
    console.error('[storage] falló al firmar la subida', err);
    return null;
  }
}

/**
 * Una URL de descarga que vence.
 *
 * El bucket es privado a propósito: con uno público, la dirección de un contrato firmado es
 * adivinable y queda accesible para siempre a quien la tenga.
 */
export async function signDownload(path: string, segundos = 300, nombre?: string): Promise<string | null> {
  if (!isStorageConfigured()) return null;
  try {
    const res = await fetch(`${base()}/object/sign/${BUCKET}/${encodeURI(path)}`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ expiresIn: segundos }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { signedURL?: string };
    if (!body.signedURL) return null;
    // El nombre original viaja aparte: en el bucket el archivo se llama por su id, y sin esto el
    // cliente se descarga un uuid sin extensión.
    const sufijo = nombre ? `&download=${encodeURIComponent(nombre)}` : '';
    return `${process.env.SUPABASE_URL}/storage/v1${body.signedURL}${sufijo}`;
  } catch (err) {
    console.error('[storage] falló al firmar la descarga', err);
    return null;
  }
}

export async function removeObject(path: string): Promise<boolean> {
  if (!isStorageConfigured()) return false;
  try {
    const res = await fetch(`${base()}/object/${BUCKET}/${encodeURI(path)}`, {
      method: 'DELETE',
      headers: headers(),
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Existe de verdad y pesa lo que dice. Es lo que confirma que la subida terminó. */
export async function statObject(path: string): Promise<{ size: number } | null> {
  if (!isStorageConfigured()) return null;
  try {
    const res = await fetch(`${base()}/object/info/${BUCKET}/${encodeURI(path)}`, {
      headers: headers(),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { size?: number; metadata?: { size?: number } };
    const size = body.size ?? body.metadata?.size;
    return typeof size === 'number' ? { size } : null;
  } catch {
    return null;
  }
}
