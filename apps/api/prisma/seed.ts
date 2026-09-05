import { prisma } from '../src/lib/prisma.js';
import { hashPassword } from '../src/lib/password.js';

interface SeedEnv {
  tenantName: string;
  adminEmail: string;
  adminPassword: string;
}

export async function seed(env: SeedEnv): Promise<{ tenantId: string; userId: string }> {
  const existing = await prisma.user.findUnique({ where: { email: env.adminEmail } });
  if (existing) {
    return { tenantId: existing.tenantId, userId: existing.id };
  }

  const tenant = await prisma.tenant.upsert({
    where: { id: (await prisma.tenant.findFirst({ where: { name: env.tenantName } }))?.id ?? '00000000-0000-0000-0000-000000000000' },
    update: {},
    create: { name: env.tenantName },
  });

  const user = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: env.adminEmail,
      passwordHash: await hashPassword(env.adminPassword),
      firstName: 'Admin',
      lastName: env.tenantName,
      role: 'ADMIN',
    },
  });

  return { tenantId: tenant.id, userId: user.id };
}

async function main() {
  const tenantName = process.env.ADMIN_TENANT_NAME;
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!tenantName || !adminEmail || !adminPassword) {
    throw new Error('ADMIN_TENANT_NAME, ADMIN_EMAIL and ADMIN_PASSWORD must be set');
  }
  const result = await seed({ tenantName, adminEmail, adminPassword });
  console.log(`Seeded tenant ${result.tenantId} with admin user ${result.userId}`);
}

if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  main().finally(() => prisma.$disconnect());
}
