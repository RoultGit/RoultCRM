import type { CreatedTenantDTO, TenantDTO, createTenantSchema } from '@roult/shared';
import type { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import type { Prisma } from '@prisma/client';
import { generatePassword, hashPassword } from '../../lib/password.js';
import { AppError, ForbiddenError } from '../../lib/errors.js';
import type { Actor } from '../../lib/scope.js';
import { recordAudit } from '../../lib/audit.js';

/** Todo lo que cuelga de una empresa cliente, en el orden en que hay que borrarlo. */
async function borrarTodoDe(tx: Prisma.TransactionClient, tenantId: string) {
  await tx.quoteItem.deleteMany({ where: { quote: { tenantId } } });
  await tx.quote.deleteMany({ where: { tenantId } });
  await tx.installment.deleteMany({ where: { tenantId } });
  await tx.attachment.deleteMany({ where: { tenantId } });
  await tx.taskUpdate.deleteMany({ where: { tenantId } });
  await tx.task.deleteMany({ where: { tenantId } });
  await tx.activity.deleteMany({ where: { tenantId } });
  await tx.customFieldValue.deleteMany({ where: { tenantId } });
  await tx.customField.deleteMany({ where: { tenantId } });
  await tx.automationRun.deleteMany({ where: { tenantId } });
  await tx.automation.deleteMany({ where: { tenantId } });
  await tx.pipelineStage.deleteMany({ where: { tenantId } });
  await tx.assignmentHistory.deleteMany({ where: { tenantId } });
  await tx.deal.deleteMany({ where: { tenantId } });
  await tx.lead.deleteMany({ where: { tenantId } });
  await tx.contact.deleteMany({ where: { tenantId } });
  await tx.company.deleteMany({ where: { tenantId } });
  await tx.whatsAppAccount.deleteMany({ where: { tenantId } });
  await tx.apiKey.deleteMany({ where: { tenantId } });
  await tx.auditLog.deleteMany({ where: { tenantId } });
  await tx.passwordResetToken.deleteMany({ where: { user: { tenantId } } });
  await tx.refreshToken.deleteMany({ where: { tenantId } });
  await tx.user.deleteMany({ where: { tenantId } });
  await tx.tenant.delete({ where: { id: tenantId } });
}

export const TenantsService = {
  async list(actor: Actor): Promise<TenantDTO[]> {
    if (!actor.isPlatformOwner) throw new ForbiddenError('Solo el dueño de la plataforma puede ver las entidades');
    const tenants = await prisma.tenant.findMany({
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { users: true } }, users: { select: { status: true } } },
    });
    return tenants.map((tenant) => ({
      id: tenant.id,
      name: tenant.name,
      createdAt: tenant.createdAt.toISOString(),
      userCount: tenant._count.users,
      // Suspendida es "nadie puede entrar": con al menos uno activo, la empresa sigue operando.
      suspended: tenant.users.length > 0 && tenant.users.every((u) => u.status === 'INACTIVE'),
      isOwn: tenant.id === actor.tenantId,
    }));
  },

  /**
   * Da de alta una empresa cliente con su primer administrador.
   *
   * Es el ÚNICO lugar del sistema que escribe fuera del tenant del que pide, así que es el que hay
   * que mirar con más cuidado. Tres reglas que no se pueden relajar:
   *  - Solo el dueño de la plataforma. Un ADMIN de una empresa cliente no crea otras empresas.
   *  - El admin que nace NUNCA es dueño de plataforma. Si lo fuera, el primer cliente podría crear
   *    entidades y listar las de todos los demás: una escalada de privilegios en el alta misma.
   *  - La contraseña se genera acá y viaja una sola vez. Que la elija quien da de alta terminaría
   *    en la misma contraseña para todos los clientes.
   */
  async create(actor: Actor, input: z.infer<typeof createTenantSchema>): Promise<CreatedTenantDTO> {
    if (!actor.isPlatformOwner) throw new ForbiddenError('Solo el dueño de la plataforma puede crear entidades');

    // Ya no hace falta chequear si el correo existe en otra empresa: desde que es único POR
    // EMPRESA, la misma persona puede ser admin de varias. La entidad nace vacía, así que dentro de
    // ella el correo está libre por definición.

    const temporaryPassword = generatePassword();
    const passwordHash = await hashPassword(temporaryPassword);

    // Transacción: una entidad sin su admin nace inaccesible y nadie podría entrar a arreglarla.
    const { tenant, user } = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({ data: { name: input.name } });
      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: input.adminEmail,
          passwordHash,
          firstName: input.adminFirstName,
          lastName: input.adminLastName,
          role: 'ADMIN',
          isPlatformOwner: false,
          // La provisoria que se le pasa al cliente por WhatsApp o correo no puede quedar viva:
          // al entrar tiene que elegir la suya. Faltaba acá aunque ya estaba en el reseteo del
          // admin, que es exactamente el mismo riesgo.
          mustChangePassword: true,
        },
      });
      return { tenant, user };
    });

    // La auditoría queda en el tenant de QUIEN dio el alta, no en el nuevo: es un acto del dueño de
    // la plataforma, y en el tenant nuevo nadie tendría contexto para entenderlo.
    await recordAudit(actor, {
      action: 'CREATE',
      entityType: 'TENANT',
      entityId: tenant.id,
      after: { name: tenant.name, adminEmail: user.email },
    });

    return {
      tenant: { id: tenant.id, name: tenant.name, createdAt: tenant.createdAt.toISOString(), userCount: 1, suspended: false, isOwn: false },
      adminEmail: user.email,
      temporaryPassword,
    };
  },

  /**
   * Suspende una empresa cliente: nadie de ahí puede entrar, pero los datos quedan.
   *
   * Es lo que hay que hacer cuando alguien deja de pagar. Borrar de una es irreversible y casi
   * siempre prematuro: el cliente vuelve, o pide sus datos, o reclama.
   */
  async suspend(actor: Actor, tenantId: string, suspended: boolean): Promise<{ users: number }> {
    if (!actor.isPlatformOwner) throw new ForbiddenError('Solo el dueño de la plataforma');
    if (tenantId === actor.tenantId) {
      throw new AppError('No podés suspender tu propia empresa', 400);
    }
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, name: true } });
    if (!tenant) throw new AppError('Esa entidad no existe', 404);

    const { count } = await prisma.user.updateMany({
      where: { tenantId },
      data: { status: suspended ? 'INACTIVE' : 'ACTIVE' },
    });
    // Y se cortan las sesiones abiertas: sin esto, quien ya estaba adentro sigue trabajando hasta
    // que se le venza el token.
    if (suspended) await prisma.refreshToken.deleteMany({ where: { tenantId } });

    await recordAudit(actor, {
      action: 'STATUS_CHANGE',
      entityType: 'TENANT',
      entityId: tenantId,
      after: { name: tenant.name, suspended, users: count },
    });
    return { users: count };
  },

  /**
   * Borra una empresa cliente y TODO lo suyo.
   *
   * Irreversible. Se pide el nombre exacto como confirmación porque el botón está al lado de los
   * otros y una entidad borrada por error no se recupera de ningún lado.
   */
  async remove(actor: Actor, tenantId: string, confirmName: string): Promise<void> {
    if (!actor.isPlatformOwner) throw new ForbiddenError('Solo el dueño de la plataforma');
    if (tenantId === actor.tenantId) {
      throw new AppError('No podés borrar tu propia empresa', 400);
    }
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new AppError('Esa entidad no existe', 404);
    if (confirmName.trim() !== tenant.name) {
      throw new AppError('Para borrarla, escribí su nombre exacto', 400);
    }

    // Todo en una transacción: a mitad de camino quedaría una empresa sin usuarios pero con datos,
    // o peor, datos huérfanos que ya nadie puede ver ni borrar.
    await prisma.$transaction((tx) => borrarTodoDe(tx, tenantId));

    // La línea de auditoría va DESPUÉS y con el tenant del dueño, no con el borrado: la del
    // borrado se fue con todo lo demás.
    await recordAudit(actor, {
      action: 'DELETE',
      entityType: 'TENANT',
      entityId: tenantId,
      before: { name: tenant.name },
    });
  },
};