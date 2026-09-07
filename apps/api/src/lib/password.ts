// bcryptjs y no bcrypt: el segundo es un módulo nativo y en un entorno serverless se instala
// compilado para otra plataforma. Los hashes son idénticos, así que las contraseñas ya guardadas
// siguen validando sin migración.
import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
