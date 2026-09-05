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
});
