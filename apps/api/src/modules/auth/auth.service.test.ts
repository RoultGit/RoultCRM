import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '../../lib/prisma.js';
import { hashPassword } from '../../lib/password.js';
import { AuthService } from './auth.service.js';
import { UnauthorizedError } from '../../lib/errors.js';

describe('AuthService', () => {
  let tenantId: string;

  beforeAll(async () => {
    const tenant = await prisma.tenant.create({ data: { name: 'Auth Test Tenant' } });
    tenantId = tenant.id;
  });

  afterAll(async () => {
    await prisma.refreshToken.deleteMany({ where: { user: { tenantId } } });
    await prisma.auditLog.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.refreshToken.deleteMany({ where: { user: { tenantId } } });
    await prisma.auditLog.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.user.create({
      data: {
        tenantId,
        email: 'admin@test.com',
        passwordHash: await hashPassword('secret123'),
        firstName: 'Admin',
        lastName: 'Test',
        role: 'ADMIN',
      },
    });
  });

  it('logs in with correct credentials and returns tokens', async () => {
    const result = await AuthService.login('admin@test.com', 'secret123');
    expect(result.accessToken).toBeTypeOf('string');
    expect(result.refreshToken).toBeTypeOf('string');
  });

  it('rejects an unknown email', async () => {
    await expect(AuthService.login('nobody@test.com', 'secret123')).rejects.toThrow(UnauthorizedError);
  });

  it('rejects a wrong password', async () => {
    await expect(AuthService.login('admin@test.com', 'wrong')).rejects.toThrow(UnauthorizedError);
  });

  it('rejects an unknown email and a wrong password for a real email with the same error', async () => {
    // Both paths must always run bcrypt.compare (never short-circuit before it) so
    // response timing can't be used to tell "no such user" apart from "wrong password" —
    // asserting identical error type/message is the unit-testable proxy for that.
    let unknownEmailError: unknown;
    let wrongPasswordError: unknown;
    try {
      await AuthService.login('nobody@test.com', 'secret123');
    } catch (err) {
      unknownEmailError = err;
    }
    try {
      await AuthService.login('admin@test.com', 'wrong');
    } catch (err) {
      wrongPasswordError = err;
    }
    expect(unknownEmailError).toBeInstanceOf(UnauthorizedError);
    expect(wrongPasswordError).toBeInstanceOf(UnauthorizedError);
    expect((unknownEmailError as Error).message).toBe((wrongPasswordError as Error).message);
  });

  it('refreshes and rotates the refresh token, invalidating the old one', async () => {
    const { refreshToken } = await AuthService.login('admin@test.com', 'secret123');
    const rotated = await AuthService.refresh(refreshToken);
    expect(rotated.refreshToken).not.toBe(refreshToken);
    await expect(AuthService.refresh(refreshToken)).rejects.toThrow(UnauthorizedError);
  });

  it('closes the refresh-token reuse race: concurrent refreshes of the same token yield exactly one winner', async () => {
    const { refreshToken } = await AuthService.login('admin@test.com', 'secret123');

    // Prime the shared PrismaClient's connection pool with two concurrent no-op
    // reads so both "lanes" already have a warm connection before the real race —
    // otherwise the second racer alone pays a fresh-connection handshake and
    // always loses trivially, which would prove nothing about the atomic-update fix.
    await Promise.all([prisma.tenant.count(), prisma.tenant.count()]);

    const results = await Promise.allSettled([
      AuthService.refresh(refreshToken),
      AuthService.refresh(refreshToken),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(UnauthorizedError);
  });

  it('logout revokes the refresh token', async () => {
    const { refreshToken } = await AuthService.login('admin@test.com', 'secret123');
    await AuthService.logout(refreshToken);
    await expect(AuthService.refresh(refreshToken)).rejects.toThrow(UnauthorizedError);
  });
});
