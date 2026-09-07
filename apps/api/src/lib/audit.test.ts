import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from './prisma.js';
import { recordAudit } from './audit.js';
import type { Actor } from './scope.js';

describe('recordAudit', () => {
  let tenantId: string;
  let userId: string;
  let actor: Actor;

  beforeAll(async () => {
    tenantId = (await prisma.tenant.create({ data: { name: 'Audit Tenant' } })).id;
    userId = (
      await prisma.user.create({
        data: {
          tenantId,
          email: `audit-${Date.now()}@roult.pe`,
          passwordHash: 'x',
          firstName: 'Audit',
          lastName: 'User',
          role: 'ADMIN',
        },
      })
    ).id;
    actor = { userId, tenantId, role: 'ADMIN' };
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  it('writes a row with who, what and when', async () => {
    await recordAudit(actor, {
      action: 'CREATE',
      entityType: 'LEAD',
      entityId: 'lead-1',
      after: { businessName: 'ABC' },
    });
    const rows = await prisma.auditLog.findMany({ where: { tenantId, entityId: 'lead-1' } });
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(userId);
    expect(rows[0].action).toBe('CREATE');
    expect(rows[0].after).toEqual({ businessName: 'ABC' });
  });

  it('keeps before and after for a change', async () => {
    await recordAudit(actor, {
      action: 'STAGE_CHANGE',
      entityType: 'DEAL',
      entityId: 'deal-1',
      before: { stage: 'CONTACTO' },
      after: { stage: 'NEGOCIACION' },
    });
    const row = await prisma.auditLog.findFirst({ where: { tenantId, entityId: 'deal-1' } });
    expect(row?.before).toEqual({ stage: 'CONTACTO' });
    expect(row?.after).toEqual({ stage: 'NEGOCIACION' });
  });

  it('never throws when the log write fails', async () => {
    // Un userId inexistente rompe la foreign key. Auditar no puede tumbar la operación que audita:
    // perder una línea de log es malo, perder el registro del cliente es peor.
    const ghost: Actor = { userId: 'no-existe', tenantId, role: 'ADMIN' };
    await expect(
      recordAudit(ghost, { action: 'CREATE', entityType: 'LEAD', entityId: 'lead-2' })
    ).resolves.toBeUndefined();
  });
});
