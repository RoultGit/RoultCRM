import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

/**
 * Cifrado de credenciales de terceros que hay que poder volver a leer.
 *
 * Una contraseña se hashea y no se descifra nunca; un token de Meta hay que mandarlo tal cual en
 * cada request, así que hace falta cifrado reversible. AES-256-GCM y no CBC: GCM viene con la
 * verificación de integridad incluida, y sin ella un token alterado en la base se usaría igual.
 */

// scrypt es caro a propósito, así que el resultado se guarda POR clave y no en una sola variable:
// con una sola, cambiar ENCRYPTION_KEY en caliente seguiría cifrando con la anterior.
const cache = new Map<string, Buffer>();

function key(): Buffer {
  const secret = process.env.ENCRYPTION_KEY;
  // Sin clave no se guarda nada. Un default silencioso dejaría credenciales de clientes cifradas
  // con una clave que está en el código, que es lo mismo que no cifrarlas.
  if (!secret || secret.length < 32) {
    throw new Error('ENCRYPTION_KEY sin configurar (mínimo 32 caracteres)');
  }
  const hit = cache.get(secret);
  if (hit) return hit;
  const derived = scryptSync(secret, 'roultcrm-secretbox', 32);
  cache.set(secret, derived);
  return derived;
}

export function hasEncryptionKey(): boolean {
  return !!process.env.ENCRYPTION_KEY && process.env.ENCRYPTION_KEY.length >= 32;
}

/** Devuelve "iv:tag:cifrado" en base64url. Un solo string para que entre en una columna de texto. */
export function seal(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), enc].map((b) => b.toString('base64url')).join(':');
}

export function open(sealed: string): string {
  const [iv, tag, enc] = sealed.split(':').map((p) => Buffer.from(p, 'base64url'));
  if (!iv || !tag || !enc) throw new Error('Credencial guardada con formato inválido');
  const decipher = createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}
