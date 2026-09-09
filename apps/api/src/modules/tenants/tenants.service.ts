import type { CreatedTenantDTO, TenantDTO, createTenantSchema } from '@roult/shared';
import type { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { generatePassword, hashPassword } from '../../lib/password.js';
import { AppError, ForbiddenError } from '../../lib/errors.js';
import type { Actor } from '../../lib/scope.js';
import { recordAudit } from '../../lib/audit.js';

export const TenantsService = {
  async list(actor: Actor): Promise<TenantDTO[]> {
    if (!actor.isPlatformOwner) throw new ForbiddenError('Solo el dueño de la plataforma puede ver las entidades');
    const tenants = await prisma.tenant.findMany({
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { users: true } } },
    });
    return tenants.map((tenant) => ({
      id: tenant.id,
      name: tenant.name,
      createdAt: tenant.createdAt.toISOString(),
      userCount: tenant._count.users,
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

    // El correo es único a nivel global, no por empresa: si ya existe, el insert fallaría con un
    // error de base. Chequearlo antes permite decir cuál es el problema en vez de un 500.
    const taken = await prisma.user.findUnique({ where: { email: input.adminEmail } });
    if (taken) {
      // AppError y no DuplicateError: el segundo manda un mensaje genérico pensado para el choque
      // de empresas parecidas, y acá lo único útil es decir CUÁL correo está tomado.
      throw new AppError(
        `El correo ${input.adminEmail} ya está en uso en otra entidad. Cada correo pertenece a una sola empresa.`,
        409
      );
    }

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
      tenant: { id: tenant.id, name: tenant.name, createdAt: tenant.createdAt.toISOString(), userCount: 1 },
      adminEmail: user.email,
      temporaryPassword,
    };
  },
};
