import { describe, it, expect, afterAll } from 'vitest';
import { prisma } from './prisma.js';

describe('prisma client', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('can create and read a tenant', async () => {
    const tenant = await prisma.tenant.create({ data: { name: 'Test Tenant' } });
    const found = await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } });
    expect(found.name).toBe('Test Tenant');
    await prisma.tenant.delete({ where: { id: tenant.id } });
  });
});
