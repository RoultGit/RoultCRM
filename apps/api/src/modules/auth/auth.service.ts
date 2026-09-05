import { verifyPassword } from '../../lib/password.js';
import { signAccessToken, generateRefreshToken, hashRefreshToken } from '../../lib/tokens.js';
import { UnauthorizedError } from '../../lib/errors.js';
import { AuthRepository } from './auth.repository.js';

const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

async function issueTokens(user: { id: string; tenantId: string; role: 'ADMIN' | 'VENDEDOR' }): Promise<TokenPair> {
  const accessToken = signAccessToken({ userId: user.id, tenantId: user.tenantId, role: user.role });
  const { token, tokenHash } = generateRefreshToken();
  await AuthRepository.storeRefreshToken(user.tenantId, user.id, tokenHash, new Date(Date.now() + REFRESH_TOKEN_TTL_MS));
  return { accessToken, refreshToken: token };
}

export const AuthService = {
  async login(email: string, password: string): Promise<TokenPair> {
    const user = await AuthRepository.findUserByEmail(email);
    if (!user || user.status !== 'ACTIVE') throw new UnauthorizedError('Invalid credentials');
    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) throw new UnauthorizedError('Invalid credentials');
    return issueTokens(user);
  },

  async refresh(refreshToken: string): Promise<TokenPair> {
    const tokenHash = hashRefreshToken(refreshToken);
    const stored = await AuthRepository.findActiveRefreshToken(tokenHash);
    if (!stored) throw new UnauthorizedError('Invalid refresh token');
    await AuthRepository.revokeRefreshToken(tokenHash);
    return issueTokens(stored.user);
  },

  async logout(refreshToken: string): Promise<void> {
    await AuthRepository.revokeRefreshToken(hashRefreshToken(refreshToken));
  },
};
