import { hashPassword, verifyPassword } from '../../lib/password.js';
import { randomBytes, createHash } from 'node:crypto';
import { sendEmail, passwordResetEmail, webOrigin } from '../../lib/mailer.js';
import { signAccessToken, generateRefreshToken, hashRefreshToken } from '../../lib/tokens.js';
import { UnauthorizedError } from '../../lib/errors.js';
import { UsersRepository } from '../users/users.repository.js';
import { AuthRepository } from './auth.repository.js';

const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// Una hora. Suficiente para que alguien vaya a buscar el correo, corto para que un link olvidado en
// una bandeja compartida no siga sirviendo mañana.
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

// Se guarda el hash, nunca el token. Mismo pepper que el refresh: si alguien lee la base, no puede
// usar los tokens vivos. Y como el token es aleatorio de 48 bytes, no hace falta bcrypt: no hay
// nada que adivinar por fuerza bruta.
function hashResetToken(token: string): string {
  const pepper = process.env.JWT_REFRESH_PEPPER;
  if (!pepper) throw new Error('JWT_REFRESH_PEPPER is not set');
  return createHash('sha256').update(token + pepper).digest('hex');
}

// bcrypt hash of an arbitrary, never-used string. Compared against on every login
// attempt for an email that doesn't resolve to a user, so verifyPassword always
// does a real bcrypt round-trip and a nonexistent email can't be timed apart from
// a wrong password for a real one (user-enumeration-by-timing mitigation).
const DUMMY_PASSWORD_HASH = '$2b$12$CwTycUXWue0Thq9StjUM0uJ8Y6b2ipCZ2A8w/BbqxjUZi+HN.hf7O';

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

async function issueTokens(user: {
  id: string;
  tenantId: string;
  role: 'ADMIN' | 'VENDEDOR';
  isPlatformOwner: boolean;
}): Promise<TokenPair> {
  const accessToken = signAccessToken({
    userId: user.id,
    tenantId: user.tenantId,
    role: user.role,
    isPlatformOwner: user.isPlatformOwner,
  });
  const { token, tokenHash } = generateRefreshToken();
  await AuthRepository.storeRefreshToken(user.tenantId, user.id, tokenHash, new Date(Date.now() + REFRESH_TOKEN_TTL_MS));
  return { accessToken, refreshToken: token };
}

export const AuthService = {
  async login(email: string, password: string): Promise<TokenPair> {
    const user = await AuthRepository.findUserByEmail(email);
    const valid = await verifyPassword(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (!user || user.status !== 'ACTIVE' || !valid) throw new UnauthorizedError('Invalid credentials');
    return issueTokens(user);
  },

  async refresh(refreshToken: string): Promise<TokenPair> {
    const tokenHash = hashRefreshToken(refreshToken);
    const { count } = await AuthRepository.consumeRefreshToken(tokenHash);
    if (count === 0) throw new UnauthorizedError('Invalid refresh token');
    const stored = await AuthRepository.findByTokenHash(tokenHash);
    if (!stored) throw new UnauthorizedError('Invalid refresh token');
    return issueTokens(stored.user);
  },

  /**
   * Cambio de contraseña por el propio usuario.
   *
   * Devuelve tokens nuevos porque cierra TODAS las sesiones, incluida la que hizo el cambio: es la
   * única forma de garantizar que no queda ninguna sesión vieja viva. Al que cambió la contraseña
   * se le entrega un par nuevo en el acto, así no se lo echa de la app por haberse protegido.
   */
  async changePassword(
    userId: string,
    tenantId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<TokenPair> {
    const user = await UsersRepository.findByIdAndTenant(userId, tenantId);
    if (!user) throw new UnauthorizedError('Invalid credentials');
    if (!(await verifyPassword(currentPassword, user.passwordHash))) {
      throw new UnauthorizedError('La contraseña actual no es correcta');
    }

    await UsersRepository.updateCredentials(userId, tenantId, {
      passwordHash: await hashPassword(newPassword),
      mustChangePassword: false,
    });
    await AuthRepository.revokeAllForUser(userId);
    return issueTokens(user);
  },

  /**
   * Pedido de "olvidé mi contraseña".
   *
   * NO devuelve nada distinto según exista o no la cuenta, ni siquiera si el correo falla al
   * enviarse. Si la respuesta cambiara, cualquiera podría probar correos uno por uno y armarse la
   * lista de quién usa el sistema — que en un CRM es la lista de clientes de la empresa.
   */
  async forgotPassword(email: string): Promise<void> {
    const user = await AuthRepository.findUserByEmailForReset(email);
    if (!user || user.status !== 'ACTIVE') return;

    // Los pedidos anteriores mueren: si no, cada uno deja otro link vivo en la bandeja de entrada.
    await AuthRepository.invalidatePasswordResets(user.id);

    const token = randomBytes(48).toString('hex');
    await AuthRepository.createPasswordReset(
      user.tenantId,
      user.id,
      hashResetToken(token),
      new Date(Date.now() + RESET_TOKEN_TTL_MS)
    );

    const link = `${webOrigin()}/reset-password?token=${token}`;
    await sendEmail({ to: user.email, ...passwordResetEmail(user.firstName, link) });
  },

  /**
   * Cambio de contraseña con el token del correo.
   *
   * No pide la contraseña actual —el sentido de esto es que no se la acuerda— así que el token ES
   * la credencial: de un solo uso, con vencimiento corto, y guardado hasheado.
   */
  async resetPasswordWithToken(token: string, newPassword: string): Promise<void> {
    const stored = await AuthRepository.consumePasswordReset(hashResetToken(token));
    if (!stored) throw new UnauthorizedError('El link no es válido o ya venció');

    await UsersRepository.updateCredentials(stored.userId, stored.tenantId, {
      passwordHash: await hashPassword(newPassword),
      mustChangePassword: false,
    });
    // Misma regla que el cambio con contraseña actual: si alguien tomó la cuenta, recuperarla tiene
    // que echarlo. Acá no se devuelven tokens nuevos a propósito: quien resetea entra por el login,
    // y así se confirma que la contraseña nueva de verdad funciona.
    await AuthRepository.revokeAllForUser(stored.userId);
  },

  async logout(refreshToken: string): Promise<void> {
    await AuthRepository.revokeRefreshToken(hashRefreshToken(refreshToken));
  },
};
