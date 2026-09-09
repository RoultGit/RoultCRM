// bcryptjs y no bcrypt: el segundo es un módulo nativo y en un entorno serverless se instala
// compilado para otra plataforma. Los hashes son idénticos, así que las contraseñas ya guardadas
// siguen validando sin migración.
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';

const SALT_ROUNDS = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// Contraseña inicial para una cuenta nueva. randomBytes y no Math.random: el segundo es predecible
// y esto abre el acceso a los datos de una empresa entera. El alfabeto excluye los caracteres que
// se confunden al dictarla por teléfono (l, I, 1, O, 0), porque estas contraseñas se pasan a mano.
export function generatePassword(length = 16): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(length);
  // Se descarta el sesgo del módulo pidiendo bytes de más y rechazando los que caen en la cola.
  let out = '';
  for (let i = 0; out.length < length; i++) {
    const byte = i < bytes.length ? bytes[i] : randomBytes(1)[0];
    if (byte < 256 - (256 % alphabet.length)) out += alphabet[byte % alphabet.length];
  }
  return out;
}
