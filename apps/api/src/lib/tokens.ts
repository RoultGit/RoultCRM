import jwt from 'jsonwebtoken';
import { randomBytes, createHash } from 'node:crypto';

export interface AccessTokenPayload {
  userId: string;
  tenantId: string;
  role: 'ADMIN' | 'VENDEDOR';
}

const ACCESS_TOKEN_TTL = '15m';

function getAccessSecret(): string {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) throw new Error('JWT_ACCESS_SECRET is not set');
  return secret;
}

function getRefreshPepper(): string {
  const pepper = process.env.JWT_REFRESH_PEPPER;
  if (!pepper) throw new Error('JWT_REFRESH_PEPPER is not set');
  return pepper;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, getAccessSecret(), { expiresIn: ACCESS_TOKEN_TTL });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, getAccessSecret()) as AccessTokenPayload;
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token + getRefreshPepper()).digest('hex');
}

export function generateRefreshToken(): { token: string; tokenHash: string } {
  const token = randomBytes(48).toString('hex');
  return { token, tokenHash: hashRefreshToken(token) };
}
