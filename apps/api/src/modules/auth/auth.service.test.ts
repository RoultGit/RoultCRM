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
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.refreshToken.deleteMany({ where: { user: { tenantId } } });
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

  it('refreshes and rotates the refresh token, invalidating the old one', async () => {
    const { refreshToken } = await AuthService.login('admin@test.com', 'secret123');
    const rotated = await AuthService.refresh(refreshToken);
    expect(rotated.refreshToken).not.toBe(refreshToken);
    await expect(AuthService.refresh(refreshToken)).rejects.toThrow(UnauthorizedError);
  });

  it('logout revokes the refresh token', async () => {
    const { refreshToken } = await AuthService.login('admin@test.com', 'secret123');
    await AuthService.logout(refreshToken);
    await expect(AuthService.refresh(refreshToken)).rejects.toThrow(UnauthorizedError);
  });
});
