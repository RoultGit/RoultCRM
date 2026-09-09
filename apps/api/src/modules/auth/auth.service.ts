import { verifyPassword } from '../../lib/password.js';
import { signAccessToken, generateRefreshToken, hashRefreshToken } from '../../lib/tokens.js';
import { UnauthorizedError } from '../../lib/errors.js';
import { AuthRepository } from './auth.repository.js';

const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

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

  async logout(refreshToken: string): Promise<void> {
    await AuthRepository.revokeRefreshToken(hashRefreshToken(refreshToken));
  },
};
