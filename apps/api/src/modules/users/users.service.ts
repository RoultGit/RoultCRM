import type { UserDTO, createUserSchema, updateUserSchema } from '@roult/shared';
import type { z } from 'zod';
import { UsersRepository } from './users.repository.js';
import { hashPassword } from '../../lib/password.js';
import { NotFoundError } from '../../lib/errors.js';
import type { User } from '@prisma/client';

export function toDTO(user: User): UserDTO {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    isPlatformOwner: user.isPlatformOwner,
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

  async update(tenantId: string, id: string, input: z.infer<typeof updateUserSchema>): Promise<UserDTO> {
    const existing = await UsersRepository.findByIdAndTenant(id, tenantId);
    if (!existing) throw new NotFoundError('User not found');
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
