import { describe, it, expect, afterAll } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { seed } from './seed.js';

describe('seed', () => {
  const env = { tenantName: 'Seed Test Co', adminEmail: 'seed-admin@test.com', adminPassword: 'secret123' };

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: env.adminEmail } });
    await prisma.tenant.deleteMany({ where: { name: env.tenantName } });
    await prisma.$disconnect();
  });

  it('creates a tenant and an ADMIN user', async () => {
    const result = await seed(env);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: result.userId } });
    expect(user.role).toBe('ADMIN');
    expect(user.tenantId).toBe(result.tenantId);
  });

  it('is idempotent: running twice does not duplicate the admin user', async () => {
    await seed(env);
    await seed(env);
    const count = await prisma.user.count({ where: { email: env.adminEmail } });
    expect(count).toBe(1);
  });

  it('handles concurrent calls safely with advisory lock', async () => {
    const concurrentEnv = { tenantName: 'Concurrent Test Co', adminEmail: 'concurrent-admin@test.com', adminPassword: 'secret123' };

    // Clean up any previous test data
    await prisma.user.deleteMany({ where: { email: concurrentEnv.adminEmail } });
    await prisma.tenant.deleteMany({ where: { name: concurrentEnv.tenantName } });

    // Fire two seed calls concurrently on unseeded tenant
    const [result1, result2] = await Promise.all([seed(concurrentEnv), seed(concurrentEnv)]);

    // Both should succeed and return the same ids
    expect(result1.tenantId).toBe(result2.tenantId);
    expect(result1.userId).toBe(result2.userId);

    // Verify exactly one tenant row exists
    const tenantCount = await prisma.tenant.count({ where: { name: concurrentEnv.tenantName } });
    expect(tenantCount).toBe(1);

    // Verify exactly one user row exists
    const userCount = await prisma.user.count({ where: { email: concurrentEnv.adminEmail } });
    expect(userCount).toBe(1);

    // Clean up
    await prisma.user.deleteMany({ where: { email: concurrentEnv.adminEmail } });
    await prisma.tenant.deleteMany({ where: { name: concurrentEnv.tenantName } });
  });
});
