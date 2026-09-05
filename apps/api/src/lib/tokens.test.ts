import { describe, it, expect } from 'vitest';
import { signAccessToken, verifyAccessToken, generateRefreshToken, hashRefreshToken } from './tokens.js';

describe('access tokens', () => {
  it('round-trips the payload', () => {
    const token = signAccessToken({ userId: 'u1', tenantId: 't1', role: 'ADMIN' });
    const decoded = verifyAccessToken(token);
    expect(decoded).toMatchObject({ userId: 'u1', tenantId: 't1', role: 'ADMIN' });
  });

  it('throws on a tampered token', () => {
    const token = signAccessToken({ userId: 'u1', tenantId: 't1', role: 'ADMIN' });
    expect(() => verifyAccessToken(token + 'x')).toThrow();
  });
});

describe('refresh tokens', () => {
  it('generates a token whose hash matches hashRefreshToken', () => {
    const { token, tokenHash } = generateRefreshToken();
    expect(hashRefreshToken(token)).toBe(tokenHash);
  });

  it('generates different tokens each call', () => {
    const a = generateRefreshToken();
    const b = generateRefreshToken();
    expect(a.token).not.toBe(b.token);
  });
});
