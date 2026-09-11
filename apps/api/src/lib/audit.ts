import type { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';
import type { Actor } from './scope.js';
import { runEvent } from '../modules/automations/engine.js';

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

  // Las automatizaciones se cuelgan ACÁ y no de cada servicio: todo cambio del sistema ya pasa por
  // esta función, así que un módulo que se agregue mañana queda cubierto sin que nadie se acuerde.
  //
  // El motor escribe con prisma directo y nunca vuelve a llamar a recordAudit: esa es la barrera
  // contra la cascada. Y nunca lanza, así que no puede tumbar la operación del usuario.
  await runEvent({
    tenantId: actor.tenantId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    before: entry.before,
    after: entry.after,
  });
}
