import { prisma } from '../src/lib/prisma.js';
import { hashPassword } from '../src/lib/password.js';

interface SeedEnv {
  tenantName: string;
  adminEmail: string;
  adminPassword: string;
}

const SEED_LOCK_KEY = 727100; // arbitrary fixed advisory-lock id, unique to this script

export async function seed(env: SeedEnv): Promise<{ tenantId: string; userId: string }> {
  // ponytail: $transaction pins the whole callback to one physical connection,
  // so the session-scoped advisory lock actually guards the queries it wraps
  // even behind a transaction-pooling proxy (e.g. PgBouncer).
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_lock(${SEED_LOCK_KEY})`;
    try {
      // Primero la empresa y después el usuario DENTRO de ella: desde que el correo es único por
      // empresa y no en el mundo, buscarlo suelto podía encontrar al admin de otra empresa y hacer
      // que el seed creyera que ya había corrido acá.
      const existingTenant = await tx.tenant.findFirst({ where: { name: env.tenantName } });
      if (existingTenant) {
        const existing = await tx.user.findFirst({
          where: { tenantId: existingTenant.id, email: env.adminEmail },
        });
        if (existing) return { tenantId: existing.tenantId, userId: existing.id };
      }

      const tenant = existingTenant ?? (await tx.tenant.create({ data: { name: env.tenantName } }));

      const user = await tx.user.create({
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
    } finally {
      await tx.$executeRaw`SELECT pg_advisory_unlock(${SEED_LOCK_KEY})`;
    }
  });
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
  main()
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
