import type { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';
import type { Actor } from './scope.js';

export type AuditAction = 'CREATE' | 'UPDATE' | 'STAGE_CHANGE' | 'ASSIGN' | 'STATUS_CHANGE' | 'CONVERT' | 'DELETE';
export type AuditEntity = 'COMPANY' | 'CONTACT' | 'LEAD' | 'DEAL' | 'USER' | 'TENANT';

export async function recordAudit(
  actor: Actor,
  entry: {
    action: AuditAction;
    entityType: AuditEntity;
    entityId: string;
    before?: Prisma.InputJsonValue;
    after?: Prisma.InputJsonValue;
  }
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        tenantId: actor.tenantId,
        userId: actor.userId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        before: entry.before,
        after: entry.after,
      },
    });
  } catch (err) {
    // Auditar nunca puede tumbar la operación que audita: perder una línea de log es malo, perder
    // el registro del cliente es peor. Queda en la consola para no perderlo en silencio.
    console.error('audit write failed', err);
  }
}
