import type { ResetPasswordDTO, UserDTO, createUserSchema, updateUserSchema } from '@roult/shared';
import type { z } from 'zod';
import { UsersRepository } from './users.repository.js';
import { hashPassword, generatePassword } from '../../lib/password.js';
import { NotFoundError, ValidationError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import type { User } from '@prisma/client';
import { AuthRepository } from '../auth/auth.repository.js';
import { recordAudit } from '../../lib/audit.js';
import type { Actor } from '../../lib/scope.js';

export function toDTO(user: User): UserDTO {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    isPlatformOwner: user.isPlatformOwner,
    mustChangePassword: user.mustChangePassword,
    status: user.status,
    phone: user.phone,
    commissionPct: Number(user.commissionPct),
    hireDate: user.hireDate.toISOString(),
  };
}

export const UsersService = {
  async me(actor: { userId: string; tenantId: string }): Promise<UserDTO> {
    const user = await UsersRepository.findByIdAndTenant(actor.userId, actor.tenantId);
    if (!user) throw new NotFoundError('User not found');
    return toDTO(user);
  },

  /**
   * Un ADMIN le resetea la contraseña a alguien de su equipo.
   *
   * Genera una provisoria, la devuelve UNA vez y marca la cuenta para que su dueño la cambie al
   * entrar: la contraseña que se pasa por WhatsApp no puede quedar viva para siempre. También corta
   * las sesiones abiertas de esa persona, que es el caso de uso real — alguien perdió el teléfono o
   * se fue de la empresa.
   */
  async resetPassword(actor: Actor, userId: string): Promise<ResetPasswordDTO> {
    const user = await UsersRepository.findByIdAndTenant(userId, actor.tenantId);
    if (!user) throw new NotFoundError('User not found');

    const temporaryPassword = generatePassword();
    await UsersRepository.updateCredentials(userId, actor.tenantId, {
      passwordHash: await hashPassword(temporaryPassword),
      mustChangePassword: true,
    });
    await AuthRepository.revokeAllForUser(userId);
    await recordAudit(actor, {
      action: 'UPDATE',
      entityType: 'USER',
      entityId: userId,
      // La contraseña NO va al log de auditoría. Lo que importa registrar es que alguien reseteó
      // el acceso de otro, no cuál fue el valor.
      after: { passwordReset: true, by: actor.userId },
    });
    return { userId, email: user.email, temporaryPassword };
  },

  async list(tenantId: string, filters: { status?: 'ACTIVE' | 'INACTIVE' } = {}): Promise<UserDTO[]> {
    const users = await UsersRepository.findManyByTenant(tenantId, filters);
    return users.map(toDTO);
  },

  async create(tenantId: string, input: z.infer<typeof createUserSchema>): Promise<UserDTO> {
    const user = await UsersRepository.create({
      tenantId,
      email: input.email,
      passwordHash: await hashPassword(input.password),
      firstName: input.firstName,
      lastName: input.lastName,
      role: input.role,
      phone: input.phone,
      commissionPct: input.commissionPct ?? 20,
    });
    return toDTO(user);
  },

  async update(
    tenantId: string,
    id: string,
    input: z.infer<typeof updateUserSchema>,
    actorUserId?: string
  ): Promise<UserDTO> {
    const existing = await UsersRepository.findByIdAndTenant(id, tenantId);
    if (!existing) throw new NotFoundError('User not found');

    if (input.role && input.role !== existing.role) {
      // Nadie se cambia el rol a sí mismo. Un admin que se baja a vendedor por error pierde el
      // acceso a esta misma pantalla y no tiene cómo volver.
      if (actorUserId && actorUserId === id) {
        throw new ValidationError('No podés cambiarte el rol a vos mismo. Pedíselo a otro administrador.');
      }
      // Y la empresa no puede quedarse sin ningún administrador: sería una empresa donde nadie
      // puede dar de alta gente, ni conectar nada, ni tocar la configuración. Nunca más.
      if (existing.role === 'ADMIN') {
        const otros = await prisma.user.count({
          where: { tenantId, role: 'ADMIN', status: 'ACTIVE', id: { not: id } },
        });
        if (otros === 0) {
          throw new ValidationError('Tiene que quedar al menos un administrador activo en la empresa.');
        }
      }
    }

    await UsersRepository.updateByIdAndTenant(id, tenantId, input);
    const updated = await UsersRepository.findByIdAndTenant(id, tenantId);
    return toDTO(updated!);
  },

  async setStatus(tenantId: string, id: string, status: 'ACTIVE' | 'INACTIVE'): Promise<UserDTO> {
    const existing = await UsersRepository.findByIdAndTenant(id, tenantId);
    if (!existing) throw new NotFoundError('User not found');
    await UsersRepository.updateStatus(id, tenantId, status);
    const updated = await UsersRepository.findByIdAndTenant(id, tenantId);
    return toDTO(updated!);
  },
};
